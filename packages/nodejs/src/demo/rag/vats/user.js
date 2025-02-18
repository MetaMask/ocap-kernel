import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

/**
 * Build function for the LLM test vat.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const { name, verbose, trust, docs } = parameters;
  const stream = false;

  const logger = {
    log: console.log,
    debug: verbose ? console.debug : () => {},
    error: console.error,
  };

  const vats = {
    llm: undefined,
    vectorStore: undefined,
  };

  const messageHistory = [];
  const pushMessage = (message) => messageHistory.push(message);
  const getConversation = (interlocutor) =>
    messageHistory.filter(({ sender, recipient }) =>
      [sender, recipient].includes(interlocutor),
    );
  const getTrust = (interlocutor) => trust[interlocutor];

  const proposeNextMessageResponseSchema = {
    $schema: 'http://json-schema.org/draft-04/schema#',
    $id: 'https://deepseek.io/conversation-response.schema.json',
    title: 'Proposed Response',
    description:
      'This document records a proposed next message in a conversation',
    type: 'object',
    properties: {
      responder: {
        description: 'Who will give the response',
        type: 'string',
      },
      justification: {
        description:
          'An explanation for why this response is proper in the context',
        type: 'string',
      },
      proposedResponse: {
        description: 'The proposed response',
        type: 'string',
      },
    },
  };

  /**
   * Validate that the JSON response meets its schema, given some parameters.
   *
   * XXX This validation logic is hardcoded.
   * XXX Ideal would be to have a tree-shaken langchainjs import available
   *
   * @param {*} response - The response to be validated.
   * @param {*} params - Parameters for validating the response.
   * @param parsedResponse
   */
  const validateProposeNextMessageResponse = (
    parsedResponse,
    { responder },
  ) => {
    const parseFailures = [];
    if (typeof parsedResponse.responder === 'undefined') {
      parseFailures.push({
        problem: 'field:missing',
        field: 'responder',
      });
    } else if (
      parsedResponse.responder.toLowerCase() !== responder.toLowerCase()
    ) {
      parseFailures.push({
        problem: 'field:value',
        field: 'responder',
        expected: responder,
        received: parsedResponse.responder,
      });
    }
    if (typeof parsedResponse.proposedResponse === 'undefined') {
      parseFailures.push({
        problem: 'field:missing',
        field: 'proposedResponse',
      });
    } else if (typeof parsedResponse.proposedResponse !== 'string') {
      parseFailures.push({
        type: 'field:type',
        field: 'proposedResponse',
        expected: 'string',
        received: typeof parsedResponse.proposedResponse,
      });
    }
    if (parseFailures.length > 0) {
      throw new Error('JSON parse failure', { cause: parseFailures });
    }
  };

  const maybeStripJSONTag = (content) => {
    const [prefix, suffix] = ['```json', '```'];
    let stripped = content.trim();
    if (stripped.startsWith(prefix)) {
      stripped = stripped.split(prefix)[1];
    }
    if (stripped.endsWith(suffix)) {
      stripped = stripped.split(suffix)[0];
    }
    return stripped.trim();
  };

  const proposeNextMessage = async (responder, conversation, knowledge) => {
    logger.debug(
      'user.proposeNextMessage:{args}',
      JSON.stringify({ responder, conversation }, null, 2),
    );

    const [promptPrefix, promptSuffix] = [
      [
        `Read through this conversation and propose what ${responder} should say next.`,
        JSON.stringify({ conversation }),
        'Include a justification for why the proposed response would be a good.',
      ],
      [
        'Be sure to follow the instructions precisely and format your answer as valid JSON!',
      ],
    ];

    const knowledgePlugin =
      knowledge !== undefined && knowledge?.length > 0
        ? [
            `The following represents ${responder}'s current knowledge. You can use it in your response, but it may not be relevant.`,
            JSON.stringify({ knowledge }),
            '',
          ]
        : [];

    const schemaPlugin = [
      'Give the answer in JSON matching the following schema.',
      JSON.stringify(proposeNextMessageResponseSchema),
      'The following is an example of a valid response, although the content is intentionally nonsense.',
      JSON.stringify({
        responder,
        justification: `${responder}'s moon is in Aquarius.`,
        proposedResponse:
          "Now is the time to take that risk I've been forgoeing.",
      }),
    ];

    let attempts = 0;
    const failures = [];
    const maxAttempts = 3;

    let response;

    while (attempts < maxAttempts) {
      try {
        logger.debug('user.proposeNextMessage:attempts', attempts);
        const failurePlugin =
          attempts > 0
            ? [
                `The following are examples of invalid responses, with the reasons for their invalidity.`,
                JSON.stringify(failures),
              ]
            : [];

        const messages = [
          {
            role: 'user',
            content: [
              ...promptPrefix,
              ...knowledgePlugin,
              ...schemaPlugin,
              ...failurePlugin,
              ...promptSuffix,
            ].join('\n'),
          },
        ];
        logger.debug('user.proposeNextMessage:messages', messages);

        response = await E(vats.llm).chat(messages, false);
        logger.debug('user.proposeNextMessage:response', response);

        const strippedResponse = maybeStripJSONTag(response);
        logger.debug(
          'user.proposeNextMessage:strippedResponse',
          strippedResponse,
        );

        let parsedResponse;

        try {
          // Parse and validate the LLM's response against the JSON schema.
          parsedResponse = JSON.parse(strippedResponse);
          logger.debug(
            'user.proposeNextMessage:parsedResponse',
            parsedResponse,
          );
        } catch (problem) {
          throw new Error('Response is not valid JSON', {
            cause: {
              type: 'format-invalid',
              expected: 'JSON',
            },
          });
        }

        validateProposeNextMessageResponse(parsedResponse, { responder });

        // Return the proposed response as a string.
        const toReturn = parsedResponse.proposedResponse;
        logger.debug('user.proposeNextMessage:toReturn', toReturn);
        return toReturn;
      } catch (problem) {
        attempts += 1;
        logger.error(
          `Response Generation Error: ${JSON.stringify({
            message: `${name} failed to respond (attempt ${attempts}).`,
            cause: { message: problem.message },
          })}`,
        );
        failures.push({
          response,
          reason: problem.cause,
        });
      }
    }
    throw new Error(
      `${name} failed to propose response to message after ${attempts} attempt(s).`,
    );
  };

  /**
   *
   * @param sender
   * @param message
   * @param conversationHistory
   */
  async function processMessage(sender, message, conversationHistory) {
    // Fallaciously assume the caller has truthfully self-identified.
    const momentaryTrust = getTrust(sender);
    const access = { secrecy: momentaryTrust };
    logger.debug('user.processMessage:access', access);

    const knowledge = await E(vats.vectorStore).retrieve(
      message.content,
      access,
    );
    logger.debug('user.processMessage:knowledge', knowledge);

    const nextMessage = await proposeNextMessage(
      name,
      [...conversationHistory, message],
      knowledge,
    );

    logger.debug(name, 'processed message', message);
    return nextMessage;
  }

  return Far('root', {
    async init(llm, vectorStore) {
      vats.llm = llm;
      vats.vectorStore = vectorStore;

      await Promise.all([
        E(llm).init(),
        (async () => {
          await E(vectorStore).initModels();
          logger.debug(`${name}'s docs`, docs);
          await E(vectorStore).addDocuments(docs);
        })(),
      ]);

      return { name, stream };
    },

    async message(sender, content) {
      const message = { sender, recipient: name, content };
      const conversationHistory = getConversation(sender);
      pushMessage(message);
      const response = await processMessage(
        sender,
        message,
        conversationHistory,
      ).catch((problem) => {
        logger.error(problem);
        return 'Error: bad brain';
      });
      pushMessage({ sender: name, recipient: sender, content: response });
      return response;
    },

    async sendMessageTo(content, recipient) {
      pushMessage({ sender: name, recipient, content });
      return await E(recipient).message(name, content);
    },
  });
}
