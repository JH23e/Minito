import subprocess
import ctypes
import sys

is_windows = sys.platform == 'win32'

# Tkinter 대신 Windows 내장 PowerShell API를 활용해 입력을 받는 Zero-Dependency 설정창
class SetupDialog:
    def __init__(self, config_manager, on_config_changed=None):
        self.config_manager = config_manager
        self.on_config_changed = on_config_changed

    # PowerShell Interaction.InputBox를 호출하여 값을 입력받음
    def prompt_win(self, prompt_text, title, default_val=""):
        if not is_windows:
            # 윈도우가 아닐 때의 콘솔 대비책
            return input(f"{prompt_text} [{default_val}]: ").strip() or default_val
            
        # PowerShell 스크립트를 한 줄로 실행시켜 다이얼로그 호출
        ps_cmd = (
            f'[void][System.Reflection.Assembly]::LoadWithPartialName("Microsoft.VisualBasic"); '
            f'[Microsoft.VisualBasic.Interaction]::InputBox("{prompt_text}", "{title}", "{default_val}")'
        )
        try:
            proc = subprocess.run(
                ["powershell", "-Command", ps_cmd],
                capture_output=True,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            return proc.stdout.strip()
        except Exception:
            return ""

    # 최초 학번, 이름, 강의실 번호를 순차적으로 입력받고 로컬 config.json에 저장
    def show(self, is_reconfigure=False):
        title = "ClassGuard Agent 설정" if is_reconfigure else "ClassGuard Agent 최초 설정"
        
        # 기존 설정 정보 백업해서 default_val로 전달 (재설정 시 편리성 도모)
        curr_room = self.config_manager.config.get("classroom_id", "301") or "301"
        curr_sid = self.config_manager.config.get("student_id", "")
        curr_sname = self.config_manager.config.get("student_name", "")
        curr_pc = self.config_manager.config.get("pc_number", "1") or "1"

        # 1. 강의실 번호 입력
        room = self.prompt_win("모니터링할 강의실 호수를 입력하세요 (예: 301)", title, curr_room)
        if not room:
            if not is_reconfigure:
                self.show_error("강의실 입력은 필수입니다. 설치를 중단합니다.")
                sys.exit(1)
            return

        # 2. 학번 입력
        sid = self.prompt_win("학생 학번(ID)을 입력하세요 (예: 20261234)", title, curr_sid)
        if not sid:
            if not is_reconfigure:
                self.show_error("학번 입력은 필수입니다. 설치를 중단합니다.")
                sys.exit(1)
            return

        # 3. 이름 입력
        sname = self.prompt_win("학생 이름을 입력하세요 (예: 홍길동)", title, curr_sname)
        if not sname:
            if not is_reconfigure:
                self.show_error("이름 입력은 필수입니다. 설치를 중단합니다.")
                sys.exit(1)
            return

        # 4. PC 번호 입력 (선택)
        spc = self.prompt_win("현재 PC 번호를 입력하세요 (선택)", title, curr_pc)

        # 설정 파일 저장 및 시작프로그램 자동 등록
        if self.config_manager.save(room, sid, sname, spc):
            self.config_manager.register_to_startup()
            if is_reconfigure:
                self.show_info("설정이 성공적으로 변경되었습니다.\n서버 대시보드와 즉각 동기화를 수행합니다.")
                if self.on_config_changed:
                    self.on_config_changed()
            else:
                self.show_info("ClassGuard Agent 설치 및 설정이 완료되었습니다.\n부팅 시 백그라운드에서 자동 구동됩니다.")
        else:
            self.show_error("설정 파일 저장에 실패했습니다.")
            if not is_reconfigure:
                sys.exit(1)


    def show_error(self, text):
        if is_windows:
            ctypes.windll.user32.MessageBoxW(0, text, "설정 오류", 0x10 | 0x0)
        else:
            print(f"[오류] {text}")

    def show_info(self, text):
        if is_windows:
            ctypes.windll.user32.MessageBoxW(0, text, "설정 완료", 0x40 | 0x0)
        else:
            print(f"[완료] {text}")
