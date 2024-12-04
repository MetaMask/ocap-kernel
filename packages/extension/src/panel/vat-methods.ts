import { isVatId } from '@ocap/kernel';
import type { MethodSchema } from '@ocap/utils';

import { executeMethodButton, methodDropdown, vatDropdown } from './buttons.js';
import type { KernelControlCommand } from '../kernel-integration/messages.js';

const methodParams = document.getElementById('method-params') as HTMLDivElement;
const vatMethods = document.getElementById('vat-methods') as HTMLElement;

let currentMethodSchema: MethodSchema[] = [];

/**
 * Updates parameter input fields based on selected method
 */
export function updateMethodParams(): void {
  methodParams.innerHTML = '';
  const selectedMethod = methodDropdown.value;

  if (!selectedMethod) {
    executeMethodButton.disabled = true;
    return;
  }

  const method = currentMethodSchema.find(
    ({ name }) => name === selectedMethod,
  );

  method?.parameters.forEach((param, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'param-field';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `param-${index}`;
    input.placeholder = param;

    wrapper.appendChild(input);
    methodParams.appendChild(wrapper);
  });

  executeMethodButton.disabled = false;
}

/**
 * Returns the selected method payload
 *
 * @returns Method payload
 */
export function getCapTpCallPayload(): KernelControlCommand | undefined {
  const selectedMethod = methodDropdown.value;
  const method = currentMethodSchema.find(
    ({ name }) => name === selectedMethod,
  );

  if (!method || !vatDropdown.value || !isVatId(vatDropdown.value)) {
    return undefined;
  }

  // Return the correctly typed command
  return {
    method: 'capTpCall' as const,
    params: {
      id: vatDropdown.value,
      method: selectedMethod,
      params: method.parameters.map((_, index) => {
        const input = document.getElementById(
          `param-${index}`,
        ) as HTMLInputElement;
        return input.value;
      }),
    },
  };
}

/**
 * Updates the method dropdown with available methods
 *
 * @param schema - Array of method schemas
 */
export function updateMethodDropdown(schema: MethodSchema[] = []): void {
  currentMethodSchema = schema;

  // Clear existing options except the default one
  while (methodDropdown.options.length > 1) {
    methodDropdown.remove(1);
  }

  // Add new options
  schema.forEach((method) => {
    const option = document.createElement('option');
    option.value = method.name;
    option.text = method.name;
    methodDropdown.add(option);
  });

  vatMethods.style.display = schema.length > 0 ? 'block' : 'none';

  updateMethodParams();
}
