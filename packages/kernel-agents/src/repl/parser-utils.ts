import type { SyntaxNode } from 'tree-sitter';

/**
 * Checks if a node is _closed_, i.e. represents an unambiguously complete statement.
 * @param node - The node to check.
 * @param buffer - The buffer to check.
 * @returns True if the node is closed, false otherwise.
 */
export function isClosed(node: SyntaxNode, buffer: string): boolean {
  const text = buffer.slice(node.startIndex, node.endIndex);
  
  if (node.type === 'function_declaration') {
    return node.children.some((child: SyntaxNode) => child.type === 'statement_block');
  }
  
  return text.trim().endsWith(';');
}

export function hasErrors(node: SyntaxNode): boolean {
  if (node.type === 'ERROR') return true;
  return node.children.some((child: SyntaxNode) => hasErrors(child));
}

export function isIncomplete(node: SyntaxNode, buffer: string): boolean {
  const errors = findErrors(node);
  
  const lastError = errors.pop();
  if (lastError === undefined) {
    return false;
  }
  const remaining = buffer.slice(lastError.endIndex);
  return remaining.trim() === '';
}

export function findErrors(node: SyntaxNode): SyntaxNode[] {
  const errors: SyntaxNode[] = [];
  if (node.type === 'ERROR') errors.push(node);
  for (const child of node.children) {
    errors.push(...findErrors(child));
  }
  return errors;
}
