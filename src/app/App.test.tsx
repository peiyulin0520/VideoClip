import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('首頁顯示標題與設定按鈕', () => {
    window.location.hash = '#/';
    render(<App />);
    expect(screen.getByRole('heading', { name: 'VideoClip 剪輯' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '設定' })).toBeTruthy();
  });

  it('未知路由顯示找不到頁面', () => {
    window.location.hash = '#/nope';
    render(<App />);
    expect(screen.getByRole('heading', { name: '找不到頁面' })).toBeTruthy();
  });
});
