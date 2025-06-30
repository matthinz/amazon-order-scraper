/**
 * ParserStates consume a single token and return either a new state
 * to use for the _next_ token or `void` to indicate that the same state
 * should be used.
 */
export type ParserState<T> = {
  (token: string, context: T, options: ParserOptions<T>): ParserState<T> | void;
  name: string;
};

export type RegexMatchProcessor<T> =
  | {
      matches: string | RegExp;
      process(
        match: RegExpMatchArray,
        context: T,
        options: ParserOptions<T>,
      ): ParserState<T> | boolean | void;
    }
  | {
      matches: string | RegExp;
      ignore: true;
    };

export type StringMatchProcessor<T> =
  | {
      equals: string;
      process(
        token: string,
        context: T,
        options: ParserOptions<T>,
      ): ParserState<T> | boolean | void;
    }
  | {
      equals: string;
      ignore: true;
    };

export type ParserOptions<T> = {
  onMatchAttempted?(
    token: string,
    match: string | RegExp,
    result: boolean,
  ): void;
  onStateChange?(oldState: ParserState<T>, newState: ParserState<T>): void;
  onToken?(token: string, context: T, state: ParserState<T>): void;
};

export type Parser<T> = (
  tokens: string[],
  context: T,
  options?: ParserOptions<T>,
) => void;
