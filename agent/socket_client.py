import socketio
from system_monitor import SystemMonitor

# TCP 소켓 연결 및 이벤트 통신을 관리하는 클래스
class SocketClient:
    def __init__(self, config):
        self.config = config
        self.sio = socketio.Client()
        self.connected = False
        self.sio.on('connect', self.on_connect)
        self.sio.on('disconnect', self.on_disconnect)
        self.sio.on('kill_process', self.on_kill_process)

    # 서버 접속 시도
    def connect(self, server_ip, server_port):
        try:
            self.sio.connect(f"http://{server_ip}:{server_port}", wait_timeout=5)
            return True
        except Exception as e:
            print(f"[소켓] 서버 연결 실패: {e}")
            return False

    # 서버와 소켓 연결 성공 시 학생 정보 등록
    def on_connect(self):
        print("[소켓] 서버와 연결되었습니다.")
        self.connected = True
        self.sio.emit('register_student', {
            "student_id": self.config['student_id'],
            "student_name": self.config['student_name'],
            "pc_number": self.config['pc_number']
        })

    # 서버와 소켓 분리 시 상태 갱신
    def on_disconnect(self):
        print("[소켓] 서버와 연결이 종료되었습니다.")
        self.connected = False

    # 서버로부터 강제 종료 이벤트를 받았을 때 프로세스 사살
    def on_kill_process(self, data):
        proc_name = data.get('processName')
        print(f"[제어] 프로세스 종료 명령 접수: {proc_name}")
        killed = SystemMonitor.kill_process(proc_name)
        print(f"[제어] 프로세스 사살 완료 (수량: {killed})")

    # 프로세스 목록 서버로 전송
    def send_process_list(self, process_data):
        if self.connected:
            self.sio.emit('process_list', {"processes": process_data})

    # 소켓 완전 종료
    def close(self):
        try:
            self.sio.disconnect()
        except:
            pass
