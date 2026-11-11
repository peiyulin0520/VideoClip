import { parseDriveFolderId } from './appState';

describe('parseDriveFolderId', () => {
  it('各種網址格式', () => {
    const id = '1fLGtxMS4oRFIOqpyn-jnBtifCRCclF2l';
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${id}`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${id}?usp=sharing`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${id}`)).toBe(id);
    expect(parseDriveFolderId(`  ${id}  `)).toBe(id);
  });
  it('不是資料夾網址就回傳 null', () => {
    expect(parseDriveFolderId('')).toBeNull();
    expect(parseDriveFolderId('https://example.com/abc')).toBeNull();
    expect(parseDriveFolderId('hello')).toBeNull();
  });
});
