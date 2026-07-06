import sys
import time
import socket
import struct
import threading
import psutil
from PIL import Image, ImageDraw
import pystray

# 커스텀 분리 모듈 로드
from config_manager import ConfigManager
from setup_dialog import SetupDialog
from system_monitor import SystemMonitor
from screen_capturer import ScreenCapturer
from udp_listener import UdpBeaconListener
from socket_client import SocketClient

# 에이전트의 전체 기능을 조율하고 백그라운드 스레드를 구동하는 오케스트레이터 클래스
class ClassGuardAgent:
    def __init__(self, config_manager):
        self.config_manager = config_manager
        self.socket_client = SocketClient(self.config_manager.config)
        self.udp_send_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        
        self.server_ip = None
        self.server_udp_port = None
        self.running = False
        self.image_id_counter = 0
        self.udp_listener = None

    # 2초마다 화면을 캡처하여 분할된 청크를 UDP로 송출하는 무한 루프 스레드
    def screen_capture_loop(self):
        while self.running:
            if not self.socket_client.connected or not self.server_ip or not self.server_udp_port:
                time.sleep(1)
                continue
            try:
                student_id_bytes = self.config_manager.config['student_id'].encode('utf-8')[:20].ljust(20, b'\x00')
                start_time = time.time()
                jpeg_data = ScreenCapturer.capture_jpeg()
                chunks = ScreenCapturer.split_into_chunks(jpeg_data)
                
                self.image_id_counter = (self.image_id_counter + 1) & 0xffffffff
                
                for idx, chunk in enumerate(chunks):
                    # 헤더: student_id(20B) + image_id(4B) + total_chunks(2B) + chunk_index(2B)
                    header = struct.pack('!20sIHH', student_id_bytes, self.image_id_counter, len(chunks), idx)
                    self.udp_send_socket.sendto(header + chunk, (self.server_ip, self.server_udp_port))
                
                elapsed = time.time() - start_time
                time.sleep(max(0.1, 2.0 - elapsed))
            except Exception as e:
                print(f"[화면 스레드] 루프 에러: {e}")
                time.sleep(2)

    # 5초마다 GUI 프로그램 프로세스 정보를 파싱하여 소켓으로 송신하는 스레드
    def process_monitor_loop(self):
        while self.running:
            if not self.socket_client.connected:
                time.sleep(1)
                continue
            try:
                win_titles = SystemMonitor.get_windows_titles()
                process_data = []
                
                for proc in psutil.process_iter(['pid', 'name']):
                    try:
                        pid = proc.info['pid']
                        name = proc.info['name']
                        if pid in win_titles:
                            for title in win_titles[pid]:
                                if title in ["Default IMONitor Window", "Program Manager", "Start"]:
                                    continue
                                process_data.append({"name": name, "title": title})
                    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                        continue
                        
                self.socket_client.send_process_list(process_data)
                time.sleep(5)
            except Exception as e:
                print(f"[프로세스 스레드] 루프 에러: {e}")
                time.sleep(5)

    # 에이전트 구동 및 자동 재연결 오케스트레이션
    def start(self):
        self.running = True
        
        threading.Thread(target=self.screen_capture_loop, daemon=True).start()
        threading.Thread(target=self.process_monitor_loop, daemon=True).start()
        
        while self.running:
            if not self.socket_client.connected:
                self.udp_listener = UdpBeaconListener(self.config_manager.config["classroom_id"])
                server_info = self.udp_listener.find_server()
                
                if server_info and self.running:
                    self.server_ip = server_info["ip"]
                    self.server_udp_port = server_info["udp_port"]
                    
                    if self.socket_client.connect(server_info["ip"], server_info["port"]):
                        self.socket_client.sio.wait()
                time.sleep(3)

    # 에이전트 안전 정지
    def stop(self):
        self.running = False
        if self.udp_listener:
            self.udp_listener.running = False
        self.socket_client.close()

    # 실시간 설정 정보 갱신 및 소켓 통신 전면 리셋
    def handle_config_changed(self):
        print("[설정 변경] 설정을 리로드하고 즉시 네트워크 연결을 재설정합니다.")
        self.stop()
        
        # 변경 설정 파일 적용
        self.config_manager.load()
        self.socket_client.config = self.config_manager.config
        
        # 상태 리셋 후 백그라운드 재접속 가동
        self.server_ip = None
        self.server_udp_port = None
        self.socket_client.connected = False
        
        threading.Thread(target=self.start, daemon=True).start()

# 시스템 트레이 아이콘용 이미지 동적 생성 (외부 로고 리소스 의존 배제)
def create_tray_image():
    image = Image.new('RGB', (32, 32), color=(26, 82, 118)) # 딥 블루 배경
    d = ImageDraw.Draw(image)
    d.ellipse([6, 6, 26, 26], fill=(52, 152, 219)) # 연한 파랑 동그라미
    return image

# 트레이 아이콘 구동 (메인 윈도우 스레드 메시지 루프 담당)
def run_tray_icon(agent):
    def on_configure(icon, item):
        # UI 입력창 호출 시 콜백 리다이렉트 연결
        SetupDialog(agent.config_manager, on_config_changed=agent.handle_config_changed).show(is_reconfigure=True)

    def on_exit(icon, item):
        print("[종료] 트레이 아이콘을 통해 에이전트를 완전 중지합니다.")
        agent.stop()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem('ClassGuard Agent', lambda: None, enabled=False),
        pystray.MenuItem('설정 변경 (Settings)', on_configure),
        pystray.MenuItem('관제 종료 (Exit)', on_exit)
    )

    icon = pystray.Icon("ClassGuardAgent", create_tray_image(), "Minito Student Agent", menu)
    icon.run()

if __name__ == '__main__':
    config_manager = ConfigManager()

    if not config_manager.is_valid():
        SetupDialog(config_manager).show()
        config_manager.load()
        
    if config_manager.is_valid():
        print(f"[기동] ClassGuard Agent 시작. 강의실: {config_manager.config['classroom_id']}호 | 학생: {config_manager.config['student_name']}")
        agent = ClassGuardAgent(config_manager)
        
        # 핵심 네트워크 관제 스레드는 백그라운드로 뺌
        threading.Thread(target=agent.start, daemon=True).start()
        
        # 메인 스레드는 윈도우 트레이 아이콘 메시지 펌프로 제어 (행 방지)
        run_tray_icon(agent)
    else:
        print("[오류] 설정값이 입력되지 않아 구동을 포기합니다.")
        sys.exit(1)
