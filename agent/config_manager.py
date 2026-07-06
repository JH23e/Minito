import os
import sys
import json

is_windows = sys.platform == 'win32'
if is_windows:
    import winreg
else:
    winreg = None

if hasattr(sys, 'frozen'):
    base_dir = os.path.dirname(sys.executable)
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(base_dir, 'config.json')


# 설정 데이터를 관리하고 로컬 저장 및 시작프로그램 등록을 수행하는 클래스
class ConfigManager:
    def __init__(self):
        self.config = {"classroom_id": "", "student_id": "", "student_name": "", "pc_number": ""}
        self.load()

    # 로컬 config.json 파일에서 설정 로드
    def load(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    self.config.update(json.load(f))
            except Exception as e:
                print(f"[설정] 로드 실패: {e}")

    # 변경된 설정을 파일에 저장 (이름/학번은 PC 번호로 자동 치환하여 호환성 유지)
    def save(self, classroom_id, student_id, student_name, pc_number):
      self.config = {
          "classroom_id": classroom_id,
          "student_id": f"PC_{pc_number}" if not student_id else student_id,
          "student_name": f"PC {pc_number}" if not student_name else student_name,
          "pc_number": pc_number
      }
      try:
          with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
              json.dump(self.config, f, indent=2, ensure_ascii=False)
          return True
      except Exception as e:
          print(f"[설정] 저장 실패: {e}")
          return False

    # Windows 레지스트리에 프로그램을 시작 프로그램으로 등록
    def register_to_startup(self):
        if not is_windows:
            return
        try:
            exe_path = os.path.abspath(sys.argv[0])
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0,
                winreg.KEY_SET_VALUE
            )
            winreg.SetValueEx(key, "ClassGuardAgent", 0, winreg.REG_SZ, f'"{exe_path}"')
            winreg.CloseKey(key)
            print("[설정] 시작프로그램 등록 성공")
        except Exception as e:
            print(f"[설정] 시작프로그램 등록 실패: {e}")

    # 필수 설정값이 입력되어 있는지 검증 (PC 번호 및 강의실 ID 필수)
    def is_valid(self):
        return bool(self.config["classroom_id"] and self.config["pc_number"])
