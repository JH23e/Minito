const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, 'config.json');

// 설정을 로드하고 파일 동기화를 담당하는 클래스
class ConfigManager {
  constructor() {
    this.config = {
      classroom_id: "301",
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
        this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (err) {
        console.error("설정 로드 실패, 기본값 사용:", err);
      }
    }
  }

  // 강의실 ID를 저장하고 비콘 방송 정보 갱신
  updateClassroomId(classroomId) {
    this.config.classroom_id = classroomId;
    try {
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
      return true;
    } catch (err) {
      console.error("설정 파일 저장 실패:", err);
      return false;
    }
  }
}

module.exports = ConfigManager;
