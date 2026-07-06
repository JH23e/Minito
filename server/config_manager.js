const os = require('os');
const fs = require('fs');
const path = require('path');

// Electron 패키징 빌드에서도 쓰기 권한이 100% 보장되는 사용자 AppData 경로로 설정 경로 강제 고정
const configDir = path.join(process.env.APPDATA || '', 'MinitoProfessor');
const configPath = path.join(configDir, 'config.json');
const CURRENT_VERSION = "1.0.5"; // 이번 릴리즈 버전 명시

// 설정을 로드하고 파일 동기화를 담당하는 클래스
class ConfigManager {
  constructor() {
    this.config = {
      classroom_id: "",
      first_run: true, // 최초 기동 판별 플래그
      app_version: CURRENT_VERSION,
      port: 3000,
      udp_port: 10102,
      udp_broadcast_port: 10101
    };
    this.load();
  }

  // 로컬 config.json 파일 읽기
  load() {
    if (fs.existsSync(configPath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // 덮어씌우기 업그레이드 감지: 저장된 설정의 버전이 현재 앱 버전과 다를 경우 강제 리셋
        if (loaded.app_version !== CURRENT_VERSION) {
          console.log(`[업데이트] 새 버전 설치 감지 (${loaded.app_version || '이전'} -> ${CURRENT_VERSION}). 설정을 안전하게 초기화합니다.`);
          this.config.first_run = true;
          this.config.classroom_id = "";
          this.save();
        } else {
          this.config = loaded;
        }
      } catch (err) {
        console.error("설정 로드 실패, 기본값 사용:", err);
      }
    }
  }

  // 강의실 ID를 저장하고 비콘 방송 정보 갱신
  updateClassroomId(classroomId) {
    this.config.classroom_id = classroomId;
    this.config.first_run = false; // 설정 저장이 성사되면 최초 실행 모드 해제
    this.config.app_version = CURRENT_VERSION;
    return this.save();
  }

  save() {
    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
      return true;
    } catch (err) {
      console.error("설정 파일 저장 실패:", err);
      return false;
    }
  }
}

module.exports = ConfigManager;
