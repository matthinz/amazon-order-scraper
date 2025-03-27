import { parse as parseHTML } from "parse5";
const IGNORE_NODES = ["script", "style", "noscript"];
export function getContentChunks(document) {
    const chunks = [];
    visitNodes(document, (node, skip, done) => {
        if (IGNORE_NODES.includes(node.nodeName)) {
            skip();
            return;
        }
        if (node.nodeName !== "#text" || !("value" in node)) {
            return;
        }
        const value = node.value.trim().replace(/\s+/g, " ");
        if (value.length === 0) {
            return;
        }
        if (chunks[chunks.length - 1]?.endsWith(":")) {
            chunks[chunks.length - 1] += ` ${value}`;
        }
        else if (value.startsWith(",") && chunks.length > 0) {
            chunks[chunks.length - 1] += value;
        }
        else {
            chunks.push(value);
        }
    });
    return chunks;
}
export function visitNodes(document, callback) {
    let alive = true;
    let result = undefined;
    const done = (value) => {
        result = value;
        alive = false;
    };
    const parsedDocument = typeof document === "string" ? parseHTML(document) : document;
    for (const child of parsedDocument.childNodes) {
        if (!alive) {
            return result;
        }
        doVisit(child);
    }
    return result;
    function doVisit(node) {
        if (!alive) {
            return;
        }
        let shouldSkip = false;
        const skip = () => {
            shouldSkip = true;
        };
        callback(node, skip, done);
        if ("childNodes" in node) {
            if (shouldSkip) {
                return;
            }
            for (const child of node.childNodes) {
                if (!alive) {
                    return;
                }
                doVisit(child);
            }
        }
    }
}
//# sourceMappingURL=parsing.js.map