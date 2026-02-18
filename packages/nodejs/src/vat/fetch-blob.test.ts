import { fetchMock } from '@ocap/repo-tools/test-utils/fetch-mock';
import '@ocap/repo-tools/test-utils/mock-endoify';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  fileURLToPath: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: mocks.readFile,
  },
}));

vi.mock('node:url', () => ({
  default: {
    fileURLToPath: mocks.fileURLToPath,
  },
}));

describe('fetchBlob', () => {
  it('handles file URLs by reading file directly', async () => {
    const filePath = '/path/to/file.js';
    const fileContent = new Uint8Array([1, 2, 3, 4]);
    const fileURL = `file://${filePath}`;

    mocks.fileURLToPath.mockReturnValue(filePath);
    mocks.readFile.mockResolvedValue(fileContent);

    const { fetchBlob } = await import('./fetch-blob.ts');
    const response = await fetchBlob(fileURL);

    expect(mocks.fileURLToPath).toHaveBeenCalledWith(new URL(fileURL));
    expect(mocks.readFile).toHaveBeenCalledWith(filePath);
    expect(response).toBeInstanceOf(Response);
    expect(await response.arrayBuffer()).toStrictEqual(fileContent.buffer);
  });

  it.each([
    ['http://example.com/file.js', 'http'],
    ['https://example.com/file.js', 'https'],
    ['ftp://example.com/file.js', 'ftp'],
  ])('handles %s URLs by using global fetch', async (url) => {
    const mockResponse = new Response('test content');
    fetchMock.mockResolvedValue(mockResponse);

    const { fetchBlob } = await import('./fetch-blob.ts');
    const response = await fetchBlob(url);

    expect(fetchMock).toHaveBeenCalledWith(url);
    expect(response).toBe(mockResponse);
  });

  it('throws error when file read fails', async () => {
    const filePath = '/path/to/nonexistent.js';
    const fileURL = `file://${filePath}`;
    const error = new Error('File not found');

    mocks.fileURLToPath.mockReturnValue(filePath);
    mocks.readFile.mockRejectedValue(error);

    const { fetchBlob } = await import('./fetch-blob.ts');

    await expect(fetchBlob(fileURL)).rejects.toThrow('File not found');
    expect(mocks.fileURLToPath).toHaveBeenCalledWith(new URL(fileURL));
    expect(mocks.readFile).toHaveBeenCalledWith(filePath);
  });

  it('throws error when fetch fails', async () => {
    const httpURL = 'https://example.com/file.js';
    const error = new Error('Network error');

    fetchMock.mockRejectedValue(error);

    const { fetchBlob } = await import('./fetch-blob.ts');

    await expect(fetchBlob(httpURL)).rejects.toThrow('Network error');
    expect(fetchMock).toHaveBeenCalledWith(httpURL);
  });

  it.each([
    {
      path: '/path/with spaces/and-special-chars.js',
      desc: 'special characters',
    },
    { path: '/path/to/file.js?param=value', desc: 'query parameters' },
    { path: '/path/to/file.js#section', desc: 'hash fragments' },
  ])('handles file URLs with $desc', async ({ path }) => {
    const fileContent = new Uint8Array([1, 2, 3]);
    const fileURL = `file://${path}`;

    mocks.fileURLToPath.mockReturnValue(path);
    mocks.readFile.mockResolvedValue(fileContent);

    const { fetchBlob } = await import('./fetch-blob.ts');
    const response = await fetchBlob(fileURL);

    expect(mocks.fileURLToPath).toHaveBeenCalledWith(new URL(fileURL));
    expect(mocks.readFile).toHaveBeenCalledWith(path);
    expect(response).toBeInstanceOf(Response);
  });
});
