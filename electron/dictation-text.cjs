const BOUNDARY_PUNCTUATION = /[，,。.!！？?；;：:、…]/;
const LEADING_BOUNDARY = /^[，,。.!！？?；;：:、…]+/;
const TRAILING_BOUNDARY = /[，,。.!！？?；;：:、…]+$/;
const TERMINAL_PUNCTUATION = /[。.!！？?…]/;

function lastMatchingCharacter(value, pattern) {
  const characters = [...String(value || "")];
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    if (pattern.test(characters[index])) return characters[index];
  }
  return "";
}

function chooseBoundary(leftRun, rightRun) {
  return lastMatchingCharacter(leftRun, TERMINAL_PUNCTUATION)
    || lastMatchingCharacter(rightRun, TERMINAL_PUNCTUATION)
    || lastMatchingCharacter(leftRun, BOUNDARY_PUNCTUATION)
    || lastMatchingCharacter(rightRun, BOUNDARY_PUNCTUATION);
}

function appendRecognizedSegment(current, segment) {
  const left = String(current || "").trimEnd();
  const right = String(segment || "").trim();
  if (!right) return left;
  if (!left) return right;

  const leftRun = left.match(TRAILING_BOUNDARY)?.[0] || "";
  const rightRun = right.match(LEADING_BOUNDARY)?.[0] || "";
  if (leftRun && rightRun) {
    const boundary = chooseBoundary(leftRun, rightRun);
    return `${left.slice(0, -leftRun.length)}${boundary}${right.slice(rightRun.length)}`;
  }
  if (leftRun || rightRun) return `${left}${right}`;
  return `${left}，${right}`;
}

function stitchRecognizedSegments(values = []) {
  return [...values].reduce(appendRecognizedSegment, "");
}

module.exports = { appendRecognizedSegment, stitchRecognizedSegments };
