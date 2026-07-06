const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// 분리된 모듈 로드
const ConfigManager = require('./config_manager');
const UdpBeaconBroadcaster = require('./udp_broadcaster');
const UdpImageReceiver = require('./udp_receiver');
const SocketServer = require('./socket_server');

// 모든 개별 모듈을 초기화하고 실행하는 마스터 오케스트레이터 클래스
class MinitoServer {
  constructor() {
    this.configManager = new ConfigManager();
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.socketServer = new SocketServer(this.httpServer);
    
    this.serverIp = this.getLocalIP();
    this.broadcaster = new UdpBeaconBroadcaster(this.configManager.config);
    this.imageReceiver = new UdpImageReceiver(
      this.configManager.config.udp_port, 
      (studentId, base64Image) => this.socketServer.broadcastScreen(studentId, base64Image)
    );

    this.configureExpress();
  }

  // 윈도우 네이티브 강의실 선택 다이얼로그 호출 (ComboBox 드롭다운 방식)
  showClassroomSelectionDialog(defaultVal = "ai_1") {
    if (process.platform !== 'win32') return defaultVal;
    
    const psCmd = `
      [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null;
      $form = New-Object Windows.Forms.Form;
      $form.Text = 'Minito 교수자 실습실 설정';
      $form.Size = New-Object Drawing.Size(320, 200);
      $form.StartPosition = 'CenterScreen';
      $form.FormBorderStyle = 'FixedDialog';
      $form.MaximizeBox = $false;
      $form.MinimizeBox = $false;
      $form.TopMost = $true;
      
      $lbl = New-Object Windows.Forms.Label;
      $lbl.Text = '관제 대상 실습실을 선택하십시오:';
      $lbl.Location = New-Object Drawing.Point(20, 20);
      $lbl.Size = New-Object Drawing.Size(260, 20);
      $form.Controls.Add($lbl);
      
      $combo = New-Object Windows.Forms.ComboBox;
      $combo.DropDownStyle = [Windows.Forms.ComboBoxStyle]::DropDownList;
      $combo.Location = New-Object Drawing.Point(40, 50);
      $combo.Size = New-Object Drawing.Size(220, 25);
      $combo.Items.Add('AI융합실습실 1실') | Out-Null;
      $combo.Items.Add('AI융합실습실 2실') | Out-Null;
      $combo.Items.Add('AI융합실습실 3실') | Out-Null;
      $combo.Items.Add('AI융합실습실 4실') | Out-Null;
      
      if ('${defaultVal}' -eq 'ai_2') { $combo.SelectedIndex = 1 }
      elseif ('${defaultVal}' -eq 'ai_3') { $combo.SelectedIndex = 2 }
      elseif ('${defaultVal}' -eq 'ai_4') { $combo.SelectedIndex = 3 }
      else { $combo.SelectedIndex = 0 }
      
      $form.Controls.Add($combo);
      
      $btn = New-Object Windows.Forms.Button;
      $btn.Text = '설정 적용';
      $btn.Location = New-Object Drawing.Point(110, 110);
      $btn.DialogResult = [Windows.Forms.DialogResult]::OK;
      $form.AcceptButton = $btn;
      $form.Controls.Add($btn);
      
      $res = $form.ShowDialog();
      if ($res -eq [Windows.Forms.DialogResult]::OK) {
        if ($combo.SelectedIndex -eq 0) { Write-Output 'ai_1' }
        elseif ($combo.SelectedIndex -eq 1) { Write-Output 'ai_2' }
        elseif ($combo.SelectedIndex -eq 2) { Write-Output 'ai_3' }
        elseif ($combo.SelectedIndex -eq 3) { Write-Output 'ai_4' }
      }
    `.trim().replace(/\r?\n/g, ' ');

    try {
      const stdout = execSync(`powershell -Command "${psCmd}"`, { encoding: 'utf8' });
      return stdout.trim() || defaultVal;
    } catch (err) {
      console.error('[오류] 설정 다이얼로그 호출 실패:', err);
      return defaultVal;
    }
  }

  // Express 라우트 및 static 폴더 서빙 세팅
  configureExpress() {
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // 현재 설정 상태 조회 API (프론트엔드 동기화용)
    this.app.get('/api/config', (req, res) => {
      res.json(this.configManager.config);
    });
    
    // 단순 설정 저장
    this.app.post('/api/config', express.json(), (req, res) => {
      const { classroom_id } = req.body;
      if (classroom_id && this.configManager.updateClassroomId(classroom_id)) {
        console.log(`[설정] 강의실 ID 변경 반영: ${classroom_id}`);
        this.broadcaster.config = this.configManager.config;
        res.json({ success: true, classroom_id });
      } else {
        res.status(400).json({ error: "실패" });
      }
    });

    // 윈도우 네이티브 다이얼로그 열기 요청 API
    this.app.post('/api/config/show-dialog', (req, res) => {
      console.log(`[설정] 윈도우 네이티브 설정 창 호출 요청 수신`);
      const currentVal = this.configManager.config.classroom_id || "ai_1";
      const selectedRoom = this.showClassroomSelectionDialog(currentVal);
      
      if (selectedRoom && this.configManager.updateClassroomId(selectedRoom)) {
        console.log(`[설정] 다이얼로그 설정을 통한 변경 완료: ${selectedRoom}`);
        this.broadcaster.config = this.configManager.config;
        res.json({ success: true, classroom_id: selectedRoom });
      } else {
        res.status(500).json({ error: "설정 실패" });
      }
    });
  }

  // 윈도우 OS의 실제 사설 IP 주소 탐지
  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
          return alias.address;
        }
      }
    }
    return '127.0.0.1';
  }

  // Windows 방화벽에 Minito 교수자 서비스 예외 규칙 등록
  registerFirewallRules() {
    if (process.platform !== 'win32') return;
    const { exec } = require('child_process');
    
    const tcpCmd = `netsh advfirewall firewall add rule name="Minito Professor TCP" dir=in action=allow protocol=TCP localport=3000 description="Minito Professor Socket Server"`;
    const udpCmd = `netsh advfirewall firewall add rule name="Minito Professor UDP" dir=in action=allow protocol=UDP localport=10101 description="Minito Professor Screen Receiver"`;
    
    // 중복 제거 후 안전하게 신규 규칙 인서트
    exec('netsh advfirewall firewall delete rule name="Minito Professor TCP"', () => {
      exec(tcpCmd, (err) => {
        if (err) console.log('[방화벽] TCP 등록 오류:', err.message);
        else console.log('[방화벽] TCP (Port 3000) 인바운드 허용 완료');
      });
    });
    
    exec('netsh advfirewall firewall delete rule name="Minito Professor UDP"', () => {
      exec(udpCmd, (err) => {
        if (err) console.log('[방화벽] UDP 등록 오류:', err.message);
        else console.log('[방화벽] UDP (Port 10101) 인바운드 허용 완료');
      });
    });
  }

  // 모든 서버 스레드/서브시스템 구동 시작
  start() {
    console.log(`[네트워크] 서버 IP 감지: ${this.serverIp}`);
    
    // Windows 방화벽 인바운드 규칙 자동 해제 등록
    this.registerFirewallRules();
    
    // 설정 파일 내 first_run 필드가 정의되어 있지 않거나(undefined), true이거나, classroom_id가 비어있다면 무조건 최초 실행으로 규정
    const isFirstRun = this.configManager.config.first_run === undefined || 
                       this.configManager.config.first_run === true || 
                       !this.configManager.config.classroom_id;
    
    if (isFirstRun) {
      console.log(`[설정] 최초 기동(isFirstRun) 조건 부합 - 강의실 설정 네이티브 창을 강제 팝업합니다.`);
      const selected = this.showClassroomSelectionDialog("ai_1");
      this.configManager.updateClassroomId(selected);
      this.broadcaster.config = this.configManager.config;
    }

    this.broadcaster.start();
    this.imageReceiver.start();

    this.httpServer.listen(this.configManager.config.port, () => {
      console.log(`[서버] 웹소켓 서버 기동 완료: http://localhost:${this.configManager.config.port}`);
    });
  }
}

// 싱글톤 기동
const server = new MinitoServer();
server.start();

