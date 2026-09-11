// Software appearance only. Task/board status cannot drive the companion face.
export function companionVisualExpression(state) {
  return ({ connecting: 'listen', listening: 'listen', thinking: 'think', speaking: 'focus', completed: 'happy', stopping: 'sleep' })[state] || 'focus';
}

export function softCompanionClosed(expressionId, blinking = false) {
  return blinking || expressionId === 'sleep' || expressionId === 'happy';
}
