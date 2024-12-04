import '@ocap/test-utils/mock-endoify';
import type { MethodSchema } from '@ocap/utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setupPanelDOM } from '../../test/helpers/panel-utils.js';

const isVatId = vi.fn(
  (input: unknown): input is string => typeof input === 'string',
);

vi.mock('@ocap/kernel', () => ({
  isVatId,
}));

describe('vat-methods', () => {
  beforeEach(async () => {
    vi.resetModules();
    await setupPanelDOM();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('updateMethodParams', () => {
    it('should clear params and disable execute button when no method selected', async () => {
      const { updateMethodParams } = await import('./vat-methods');
      const { methodDropdown, executeMethodButton } = await import('./buttons');
      methodDropdown.value = '';
      updateMethodParams();
      const methodParams = document.getElementById('method-params');
      expect(methodParams?.innerHTML).toBe('');
      expect(executeMethodButton.disabled).toBe(true);
    });

    it('should create input fields for method parameters', async () => {
      const { updateMethodParams, updateMethodDropdown } = await import(
        './vat-methods'
      );
      const { methodDropdown } = await import('./buttons');
      const testSchema: MethodSchema[] = [
        {
          name: 'testMethod',
          parameters: ['param1', 'param2'],
        },
      ];
      updateMethodDropdown(testSchema);
      methodDropdown.value = 'testMethod';
      updateMethodParams();
      const methodParams = document.getElementById('method-params');
      const inputs = methodParams?.querySelectorAll('input');
      expect(inputs).toHaveLength(2);
      expect(inputs?.[0]?.placeholder).toBe('param1');
      expect(inputs?.[1]?.placeholder).toBe('param2');
    });
  });

  describe('getCapTpCallPayload', () => {
    it('should return undefined when no method is selected', async () => {
      const { getCapTpCallPayload } = await import('./vat-methods');
      const { methodDropdown, vatDropdown } = await import('./buttons');
      methodDropdown.value = '';
      vatDropdown.value = '';
      expect(getCapTpCallPayload()).toBeUndefined();
    });

    it('should return undefined when no vat is selected', async () => {
      const { getCapTpCallPayload, updateMethodDropdown } = await import(
        './vat-methods'
      );
      const { methodDropdown, vatDropdown } = await import('./buttons');
      const testSchema: MethodSchema[] = [
        {
          name: 'testMethod',
          parameters: ['param1'],
        },
      ];
      updateMethodDropdown(testSchema);
      methodDropdown.value = 'testMethod';
      vatDropdown.value = '';
      isVatId.mockReturnValue(false);
      expect(getCapTpCallPayload()).toBeUndefined();
    });

    it('should return correct payload with parameters', async () => {
      isVatId.mockReturnValue(true);
      const { getCapTpCallPayload, updateMethodDropdown } = await import(
        './vat-methods'
      );
      const { methodDropdown, vatDropdown } = await import('./buttons');
      const { updateMethodParams } = await import('./vat-methods');
      const testSchema: MethodSchema[] = [
        {
          name: 'testMethod',
          parameters: ['param1', 'param2'],
        },
      ];
      updateMethodDropdown(testSchema);
      vatDropdown.value = 'v0';
      methodDropdown.value = 'testMethod';
      updateMethodParams();
      const param0 = document.getElementById('param-0') as HTMLInputElement;
      const param1 = document.getElementById('param-1') as HTMLInputElement;
      param0.value = 'value1';
      param1.value = 'value2';
      expect(getCapTpCallPayload()).toStrictEqual({
        method: 'capTpCall',
        params: {
          id: 'v0',
          method: 'testMethod',
          params: ['value1', 'value2'],
        },
      });
    });
  });

  describe('updateMethodDropdown', () => {
    it('should clear existing options except default', async () => {
      const { updateMethodDropdown } = await import('./vat-methods');
      const { methodDropdown } = await import('./buttons');
      const initialOptions = ['option1', 'option2'];
      initialOptions.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.text = value;
        methodDropdown.add(option);
      });
      updateMethodDropdown([]);
      expect(methodDropdown.options).toHaveLength(1);
    });

    it('should add new options from schema', async () => {
      const { updateMethodDropdown } = await import('./vat-methods');
      const { methodDropdown } = await import('./buttons');
      const testSchema: MethodSchema[] = [
        { name: 'method1', parameters: [] },
        { name: 'method2', parameters: [] },
      ];
      updateMethodDropdown(testSchema);
      expect(methodDropdown.options).toHaveLength(3);
      expect(methodDropdown.options[1]?.value).toBe('method1');
      expect(methodDropdown.options[2]?.value).toBe('method2');
    });

    it('should show/hide vat methods section based on schema length', async () => {
      const { updateMethodDropdown } = await import('./vat-methods');
      const vatMethods = document.getElementById('vat-methods');
      updateMethodDropdown([]);
      expect(vatMethods?.style.display).toBe('none');
      updateMethodDropdown([{ name: 'method1', parameters: [] }]);
      expect(vatMethods?.style.display).toBe('block');
    });
  });
});
