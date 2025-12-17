export type ResponseFormatter<FormattedResponse> = (
  response: string,
  done: boolean,
) => FormattedResponse;

// Default response formatter that returns an object with a response and done property
export const objectResponseFormatter: ResponseFormatter<{
  response: string;
  done: boolean;
}> = (response, done) => ({ response, done });

export type ObjectResponse = {
  response: string;
  done: boolean;
};
