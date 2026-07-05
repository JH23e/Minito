const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// 1. 백그라운드 Node.js 소켓 + UDP 서버 구동
// 동일 프로세스에서 실행하므로 직접 모듈 로드
require('./server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "ClassGuard - 실습 PC 통합 관제 시스템",
    backgroundColor: "#0d0e12",
    icon: path.join(__dirname, 'public', 'favicon.ico'), // 아이콘 임시 패스 지정
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 메뉴 바 제거 (깔끔한 프리미엄 UI 유지)
  Menu.setApplicationMenu(null);

  // 로컬 http 서버로 서빙되는 대시보드 주소 로드
  mainWindow.loadURL('http://localhost:3000');

  // 개발자 도구 활성화 (필요한 경우 활성화 해두면 디버깅에 유리)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  // macOS가 아닐 경우 프로세스 완전 종료
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
