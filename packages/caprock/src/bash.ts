import Parser from 'tree-sitter';
import Bash from 'tree-sitter-bash';

export type PipePosition = 'alone' | 'first' | 'downstream';

export type RedirectKind =
  | 'out'
  | 'append'
  | 'err'
  | 'err-append'
  | 'out-err'
  | 'out-err-append'
  | 'in'
  | 'herestring'
  | 'heredoc'
  | 'fd-dup'
  | 'unknown';

export type Redirect = { kind: RedirectKind; target: string };

export type ParsedCommand = {
  name: string;
  argv: string[];
  pipePosition: PipePosition;
  redirects: Redirect[];
};

export type DropReason =
  | 'parse_error'
  | 'dynamic_command'
  | 'curl_pipe_shell'
  | 'eval_dynamic'
  | 'empty';

/** One dependent pipeline: commands joined by `|`. */
export type Pipeline = ParsedCommand[];

export type DecomposeResult =
  | { ok: true; clauses: Pipeline[] }
  | { ok: false; reason: DropReason; clauses: Pipeline[] };

let cachedParser: Parser | null = null;

/**
 * Return a lazily-initialized shared tree-sitter parser for Bash.
 *
 * @returns The shared Parser instance.
 */
function getParser(): Parser {
  if (cachedParser !== null) {
    return cachedParser;
  }
  const parser = new Parser();
  parser.setLanguage(Bash as Parser.Language);
  cachedParser = parser;
  return parser;
}

const NETWORK_CMDS = new Set(['curl', 'wget', 'fetch']);
const SHELL_INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash']);

/**
 * Parse a bash source string and decompose it into a list of commands.
 *
 * Returns `ok: false` with a reason when the input is unsafe or unparseable.
 *
 * @param source - The raw bash command string to parse.
 * @returns A DecomposeResult with the parsed commands and an ok/reason flag.
 */
export function decompose(source: string): DecomposeResult {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty', clauses: [] };
  }

  const parser = getParser();
  const tree = parser.parse(source);

  if (hasErrorNode(tree.rootNode)) {
    return { ok: false, reason: 'parse_error', clauses: [] };
  }

  // Collect clauses from all top-level children of the program node
  const clauses: Pipeline[] = [];
  for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
    const child = tree.rootNode.namedChild(i);
    if (child !== null) {
      clauses.push(...collectClauses(child));
    }
  }

  const allCommands = clauses.flat();

  if (allCommands.some((cmd) => cmd.name === '<dynamic>')) {
    return { ok: false, reason: 'dynamic_command', clauses };
  }
  if (hasCurlPipeShell(tree.rootNode)) {
    return { ok: false, reason: 'curl_pipe_shell', clauses };
  }
  if (hasEvalDynamic(allCommands)) {
    return { ok: false, reason: 'eval_dynamic', clauses };
  }

  return { ok: true, clauses };
}

/**
 * Return true if the syntax tree contains any ERROR or missing node.
 *
 * @param node - The root node to inspect recursively.
 * @returns True if any descendant is an error or missing node.
 */
function hasErrorNode(node: Parser.SyntaxNode): boolean {
  if (node.type === 'ERROR' || node.isMissing) {
    return true;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && hasErrorNode(child)) {
      return true;
    }
  }
  return false;
}

/**
 * Collect all `command` nodes found under the given syntax node.
 *
 * @param node - The root of the subtree to walk.
 * @returns An array of ParsedCommand objects extracted from command nodes.
 */
function collectCommands(node: Parser.SyntaxNode): ParsedCommand[] {
  const out: ParsedCommand[] = [];
  walk(node, (nd) => {
    if (nd.type === 'command') {
      out.push(extractCommand(nd));
    }
  });
  return out;
}

/**
 * Collect pipeline clauses from a syntax node, splitting on `&&`, `||`, and `;`.
 *
 * - `list` nodes (&&/||) are recursed into, producing one clause per operand.
 * - `pipeline` nodes produce one clause containing all their command nodes.
 * - `command` nodes produce one single-command clause.
 * - `redirected_statement` nodes delegate to their inner command/pipeline child.
 * - All other node types (subshell, compound_statement, etc.) are treated as
 *   one opaque clause by falling back to {@link collectCommands}.
 *
 * @param node - The syntax node to collect clauses from.
 * @returns An array of Pipeline clauses.
 */
function collectClauses(node: Parser.SyntaxNode): Pipeline[] {
  switch (node.type) {
    case 'list': {
      // && and || — recurse into both named children
      const result: Pipeline[] = [];
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child !== null) {
          result.push(...collectClauses(child));
        }
      }
      return result;
    }
    case 'pipeline': {
      // All commands in this pipeline form one clause.
      // Each stage may be a bare `command` or a `redirected_statement` wrapping one.
      const cmds: ParsedCommand[] = [];
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child === null) {
          continue;
        }
        const cmd = extractPipelineStage(child);
        if (cmd !== null) {
          cmds.push(cmd);
        }
      }
      return cmds.length > 0 ? [cmds] : [];
    }
    case 'command':
      return [[extractCommand(node)]];
    case 'redirected_statement': {
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (
          child !== null &&
          child.type !== 'file_redirect' &&
          child.type !== 'heredoc_redirect' &&
          child.type !== 'herestring_redirect'
        ) {
          return collectClauses(child);
        }
      }
      return [];
    }
    default: {
      // subshell, compound_statement, etc. — collect all contained commands as one opaque clause
      const cmds = collectCommands(node);
      return cmds.length > 0 ? [cmds] : [];
    }
  }
}

/**
 * Extract a ParsedCommand from a single pipeline stage node.
 *
 * A pipeline stage is either a bare `command` or a `redirected_statement`
 * wrapping a command with I/O redirects (e.g. `cmd 2>&1`).
 *
 * @param node - A named child of a `pipeline` node.
 * @returns The extracted ParsedCommand, or null if the stage is not a command.
 */
function extractPipelineStage(node: Parser.SyntaxNode): ParsedCommand | null {
  if (node.type === 'command') {
    return extractCommand(node);
  }
  if (node.type === 'redirected_statement') {
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (
        child !== null &&
        child.type !== 'file_redirect' &&
        child.type !== 'heredoc_redirect' &&
        child.type !== 'herestring_redirect'
      ) {
        if (child.type === 'command') {
          return extractCommand(child);
        }
      }
    }
  }
  return null;
}

/**
 * Determine where in a pipeline a command sits.
 *
 * @param commandNode - The command node whose position is to be determined.
 * @returns 'first' if the command starts a pipeline, 'downstream' if it follows
 *   one, or 'alone' if it is not part of a pipeline.
 */
function computePipePosition(commandNode: Parser.SyntaxNode): PipePosition {
  let child: Parser.SyntaxNode = commandNode;
  let { parent } = commandNode;
  while (parent !== null) {
    if (parent.type === 'pipeline') {
      for (let i = 0; i < parent.namedChildCount; i++) {
        if (parent.namedChild(i) === child) {
          return i === 0 ? 'first' : 'downstream';
        }
      }
      return 'alone';
    }
    child = parent;
    parent = parent.parent;
  }
  return 'alone';
}

/**
 * Depth-first walk of a syntax tree, calling `visit` on each named node.
 *
 * @param node - The node to start from.
 * @param visit - Callback invoked for every node in the subtree.
 */
function walk(
  node: Parser.SyntaxNode,
  visit: (n: Parser.SyntaxNode) => void,
): void {
  visit(node);
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null) {
      walk(child, visit);
    }
  }
}

/**
 * Extract a ParsedCommand from a `command` syntax node.
 *
 * @param commandNode - The `command` node to extract details from.
 * @returns A ParsedCommand with name, argv, pipe position, and redirects.
 */
function extractCommand(commandNode: Parser.SyntaxNode): ParsedCommand {
  const nameNode = commandNode.childForFieldName('name');
  const name = nameNode === null ? '<dynamic>' : extractCommandName(nameNode);

  const argv: string[] = [];
  const redirects: Redirect[] = [];
  for (let i = 0; i < commandNode.namedChildCount; i++) {
    const child = commandNode.namedChild(i);
    if (child === null || child === nameNode) {
      continue;
    }
    if (child.type === 'variable_assignment') {
      continue;
    }
    if (child.type === 'file_redirect' || child.type === 'redirect') {
      const redirect = parseFileRedirect(child);
      if (redirect !== null) {
        redirects.push(redirect);
      }
      continue;
    }
    if (child.type === 'herestring_redirect') {
      redirects.push({ kind: 'herestring', target: '<inline>' });
      continue;
    }
    if (child.type === 'heredoc_redirect') {
      redirects.push({ kind: 'heredoc', target: '<inline>' });
      continue;
    }
    argv.push(extractArgText(child));
  }

  const { parent } = commandNode;
  if (parent !== null && parent.type === 'redirected_statement') {
    for (let i = 0; i < parent.namedChildCount; i++) {
      const sib = parent.namedChild(i);
      if (sib === null || sib === commandNode) {
        continue;
      }
      if (sib.type === 'file_redirect') {
        const redirect = parseFileRedirect(sib);
        if (redirect !== null) {
          redirects.push(redirect);
        }
      } else if (sib.type === 'heredoc_redirect') {
        redirects.push({ kind: 'heredoc', target: '<inline>' });
      } else if (sib.type === 'herestring_redirect') {
        redirects.push({ kind: 'herestring', target: '<inline>' });
      }
    }
  }

  return {
    name,
    argv,
    pipePosition: computePipePosition(commandNode),
    redirects,
  };
}

/**
 * Parse a `file_redirect` or `redirect` syntax node into a Redirect object.
 *
 * @param node - The redirect syntax node to parse.
 * @returns A Redirect object, or null if no operator could be found.
 */
function parseFileRedirect(node: Parser.SyntaxNode): Redirect | null {
  let descriptor: string | null = null;
  let operator: string | null = null;
  let targetNode: Parser.SyntaxNode | null = null;
  for (let i = 0; i < node.childCount; i++) {
    const childNode = node.child(i);
    if (childNode === null) {
      continue;
    }
    if (childNode.isNamed) {
      if (childNode.type === 'file_descriptor') {
        descriptor = childNode.text;
      } else {
        targetNode ??= childNode;
      }
    } else {
      operator ??= childNode.text;
    }
  }
  if (operator === null) {
    return null;
  }
  const target =
    targetNode === null ? '<unknown>' : extractRedirectTarget(targetNode);
  return { kind: classifyRedirectOperator(operator, descriptor), target };
}

/**
 * Extract a text representation of a redirect target node.
 *
 * @param node - The syntax node representing the redirect target.
 * @returns A string for the target, or '<dynamic>' for shell expansions.
 */
function extractRedirectTarget(node: Parser.SyntaxNode): string {
  if (node.type === 'word') {
    return node.text;
  }
  if (node.type === 'number') {
    return node.text;
  }
  if (node.type === 'raw_string') {
    return stripQuotes(node.text);
  }
  if (node.type === 'string') {
    if (containsExpansion(node)) {
      return '<dynamic>';
    }
    return stripQuotes(node.text);
  }
  if (
    node.type === 'simple_expansion' ||
    node.type === 'expansion' ||
    node.type === 'command_substitution' ||
    node.type === 'process_substitution' ||
    node.type === 'arithmetic_expansion'
  ) {
    return '<dynamic>';
  }
  return node.text;
}

/**
 * Map a redirect operator string to a RedirectKind.
 *
 * @param operator - The redirect operator token (e.g. `>`, `>>`, `&>`).
 * @param descriptor - The optional file descriptor digit (e.g. `'2'` for stderr).
 * @returns The corresponding RedirectKind.
 */
function classifyRedirectOperator(
  operator: string,
  descriptor: string | null,
): RedirectKind {
  if (operator === '>&' || operator === '<&') {
    return 'fd-dup';
  }
  if (operator === '<') {
    return 'in';
  }
  if (operator === '>' || operator === '>|') {
    return descriptor === '2' ? 'err' : 'out';
  }
  if (operator === '>>') {
    return descriptor === '2' ? 'err-append' : 'append';
  }
  if (operator === '&>') {
    return 'out-err';
  }
  if (operator === '&>>') {
    return 'out-err-append';
  }
  return 'unknown';
}

/**
 * Extract the command name string from a command name syntax node.
 *
 * @param node - The name node from a `command` syntax node.
 * @returns The command name string, or '<dynamic>' for unexpandable names.
 */
function extractCommandName(node: Parser.SyntaxNode): string {
  const inner = node.namedChild(0) ?? node;
  if (inner.type === 'word') {
    return inner.text;
  }
  if (inner.type === 'string') {
    return stripQuotes(inner.text);
  }
  if (inner.type === 'raw_string') {
    return stripQuotes(inner.text);
  }
  return '<dynamic>';
}

/**
 * Extract the text of an argument syntax node.
 *
 * @param node - The argument syntax node to extract text from.
 * @returns The argument text, or '<dynamic>' for unexpandable arguments.
 */
function extractArgText(node: Parser.SyntaxNode): string {
  if (node.type === 'word') {
    return node.text;
  }
  if (node.type === 'raw_string') {
    return stripQuotes(node.text);
  }
  if (node.type === 'string') {
    if (containsExpansion(node)) {
      return '<dynamic>';
    }
    return stripQuotes(node.text);
  }
  if (node.type === 'concatenation') {
    if (containsExpansion(node)) {
      return '<dynamic>';
    }
    let acc = '';
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child !== null) {
        acc += extractArgText(child);
      }
    }
    return acc;
  }
  if (
    node.type === 'simple_expansion' ||
    node.type === 'expansion' ||
    node.type === 'command_substitution' ||
    node.type === 'process_substitution' ||
    node.type === 'arithmetic_expansion'
  ) {
    return '<dynamic>';
  }
  return node.text;
}

/**
 * Return true if the node or any descendant is a shell expansion.
 *
 * @param node - The syntax node to inspect.
 * @returns True if the node subtree contains any shell expansion.
 */
function containsExpansion(node: Parser.SyntaxNode): boolean {
  if (
    node.type === 'simple_expansion' ||
    node.type === 'expansion' ||
    node.type === 'command_substitution' ||
    node.type === 'process_substitution' ||
    node.type === 'arithmetic_expansion'
  ) {
    return true;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child !== null && containsExpansion(child)) {
      return true;
    }
  }
  return false;
}

/**
 * Strip a single layer of surrounding single or double quotes from a string.
 *
 * @param text - The string to strip quotes from.
 * @returns The unquoted string, or the original if not quoted.
 */
function stripQuotes(text: string): string {
  if (text.length < 2) {
    return text;
  }
  const first = text[0];
  const last = text[text.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Return true if the tree contains a `curl | shell-interpreter` pipeline.
 *
 * @param node - The root syntax node to scan.
 * @returns True if any pipeline pipes a network command into a shell.
 */
function hasCurlPipeShell(node: Parser.SyntaxNode): boolean {
  let found = false;
  walk(node, (nd) => {
    if (found || nd.type !== 'pipeline') {
      return;
    }
    const stages: Parser.SyntaxNode[] = [];
    for (let i = 0; i < nd.namedChildCount; i++) {
      const stageChild = nd.namedChild(i);
      if (stageChild !== null) {
        stages.push(stageChild);
      }
    }
    if (stages.length < 2) {
      return;
    }
    const first = stages[0];
    const last = stages[stages.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    const firstName = firstCommandName(first);
    const lastName = firstCommandName(last);
    if (
      firstName !== null &&
      lastName !== null &&
      NETWORK_CMDS.has(firstName) &&
      SHELL_INTERPRETERS.has(lastName)
    ) {
      found = true;
    }
  });
  return found;
}

/**
 * Return the name of the first command found in a syntax node subtree.
 *
 * @param node - The syntax node to search.
 * @returns The command name string, or null if no command was found.
 */
function firstCommandName(node: Parser.SyntaxNode): string | null {
  if (node.type === 'command') {
    const nameNode = node.childForFieldName('name');
    if (nameNode === null) {
      return null;
    }
    return extractCommandName(nameNode);
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child === null) {
      continue;
    }
    const name = firstCommandName(child);
    if (name !== null) {
      return name;
    }
  }
  return null;
}

/**
 * Return true if any `eval` command has a dynamic (unexpandable) argument.
 *
 * @param commands - The list of parsed commands to inspect.
 * @returns True if eval is called with a dynamic argument.
 */
function hasEvalDynamic(commands: ParsedCommand[]): boolean {
  for (const cmd of commands) {
    if (cmd.name === 'eval' && cmd.argv.some((a) => a.includes('<dynamic>'))) {
      return true;
    }
  }
  return false;
}
