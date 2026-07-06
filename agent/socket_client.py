import socketio
from system_monitor import SystemMonitor

# 복수의 교수 PC 대시보드 커넥션들을 관리하는 소켓 풀 클래스
class SocketClient:
    def __init__(self, config):
        self.config = config
        self.connections = {} # { "ip": { "sio": socketio.Client(), "connected": bool } }

    # 실시간 활성 서버 리스트를 기반으로 소켓 연결 풀을 갱신 (새 서버 연결 및 만료 서버 정리)
    def update_connections(self, active_servers):
        active_ips = [srv["ip"] for srv in active_servers]
        
        # 1. 만료된 서버 세션 정리
        expired_ips = [ip for ip in self.connections.keys() if ip not in active_ips]
        for ip in expired_ips:
            print(f"[소켓] 만료된 교수 PC 연결 해제 시도: {ip}")
            try:
                self.connections[ip]["sio"].disconnect()
            except:
                pass
            del self.connections[ip]

        # 2. 신규 감지된 서버 세션 연결
        for srv in active_servers:
            ip = srv["ip"]
            port = srv["port"]
            if ip not in self.connections:
                self.connections[ip] = {"sio": None, "connected": False}
                threading_target = lambda: self._connect_server(ip, port)
                import threading
                threading.Thread(target=threading_target, daemon=True).start()

    def _connect_server(self, ip, port):
        sio = socketio.Client()
        
        @sio.on('connect')
        def on_connect():
            print(f"[소켓] 교수 PC({ip})와 연결 성공")
            if ip in self.connections:
                self.connections[ip]["connected"] = True
            sio.emit('register_student', {
                "student_id": self.config['student_id'],
                "student_name": self.config['student_name'],
                "pc_number": self.config['pc_number']
            })

        @sio.on('disconnect')
        def on_disconnect():
            print(f"[소켓] 교수 PC({ip})와 연결 해제")
            if ip in self.connections:
                self.connections[ip]["connected"] = False

        @sio.on('kill_process')
        def on_kill_process(data):
            proc_name = data.get('processName')
            print(f"[제어] 교수 PC({ip})로부터 프로세스 종료 명령 접수: {proc_name}")
            killed = SystemMonitor.kill_process(proc_name)
            print(f"[제어] 프로세스 사살 완료 (수량: {killed})")

        try:
            if ip in self.connections:
                self.connections[ip]["sio"] = sio
            sio.connect(f"http://{ip}:{port}", wait_timeout=5)
        except Exception as e:
            print(f"[소켓] 교수 PC({ip}:{port}) 연결 오류: {e}")
            if ip in self.connections:
                del self.connections[ip]

    # 현재 살아있는 모든 교수 PC에 의심 프로세스 정보 전송
    def send_process_list(self, process_data):
        for ip, conn in list(self.connections.items()):
            if conn["connected"] and conn["sio"]:
                try:
                    conn["sio"].emit('process_list', {"processes": process_data})
                except Exception as e:
                    print(f"[소켓] 프로세스 전송 에러({ip}): {e}")

    @property
    def connected(self):
        # 하나라도 연결되어 있으면 연결된 상태로 간주
        return any(conn["connected"] for conn in self.connections.values())

    # 소켓 세션 전체 종료
    def close(self):
        for ip, conn in list(self.connections.items()):
            try:
                conn["sio"].disconnect()
            except:
                pass
        self.connections.clear()

