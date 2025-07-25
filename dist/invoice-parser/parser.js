export function createParser(initialState) {
    return (tokens, context, options) => {
        let currentState = initialState;
        for (const token of tokens) {
            if (options?.onToken) {
                options.onToken(token, context, currentState);
            }
            const nextState = currentState(token, context, options);
            if (nextState && nextState !== currentState) {
                if (options?.onStateChange) {
                    options.onStateChange(currentState, nextState);
                }
                currentState = nextState;
            }
        }
    };
}
function compileMatchProcessor(processor) {
    if (typeof processor === "function") {
        return processor;
    }
    return (token, context, options) => {
        if ("matches" in processor) {
            if ("ignore" in processor && processor.ignore) {
                return;
            }
            let regex;
            if (typeof processor.matches === "string") {
                if (/\${[A-Z_]+_PATTERN}/.test(processor.matches)) {
                    throw new Error(`Detected a pattern placeholder in matches stringg: ${JSON.stringify(processor.matches)}. Please use a RegExp or a string without placeholders.`);
                }
                regex = new RegExp(processor.matches, "i");
            }
            else if (processor.matches instanceof RegExp) {
                regex = processor.matches;
            }
            else {
                throw new Error(`Invalid matches pattern: ${processor.matches}. Expected string or RegExp.`);
            }
            const match = regex.exec(token);
            if (options?.onMatchAttempted) {
                options.onMatchAttempted(token, regex, !!match);
            }
            if (match && "process" in processor) {
                return processor.process(match, context, options);
            }
        }
        else if ("equals" in processor && typeof processor.equals === "string") {
            if ("ignore" in processor && processor.ignore) {
                return;
            }
            if (options?.onMatchAttempted) {
                options.onMatchAttempted(token, processor.equals, token === processor.equals);
            }
            if (token === processor.equals && "process" in processor) {
                return processor.process(token, context, options);
            }
        }
        else {
            throw new Error(`Invalid match processor: ${processor}`);
        }
    };
}
export function newParserState(name, ...args) {
    const func = (token, context, options) => {
        for (const arg of args) {
            const processor = compileMatchProcessor(arg);
            const result = processor(token, context, options);
            if (result === true) {
                // This processor handled the token.
                break;
            }
            else if (result != null && result !== false) {
                return result;
            }
        }
        // We didn't handle the token, but we want to stay in this parser state.
        return func;
    };
    Object.defineProperty(func, "name", { value: name });
    return func;
}
export function consumeNextToken(name, processor, fallback) {
    const parserState = newParserState(name, processor);
    let handled = false;
    const func = (token, context, options) => {
        if (handled) {
            return fallback;
        }
        else {
            handled = true;
            return parserState(token, context, options);
        }
    };
    Object.defineProperty(func, "name", { value: name });
    return func;
}
export function skipNextToken(nextParserState) {
    return (_token, _context, _options) => {
        return nextParserState;
    };
}
//# sourceMappingURL=parser.js.map