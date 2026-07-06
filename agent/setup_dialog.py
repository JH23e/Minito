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
                creationflags=subprocess.CREATE_NO_WINDOW if is_windows else 0
            )
            return proc.stdout.strip()
        except Exception:
            return ""

    # PowerShell .NET Forms API를 빌려 단일 화면에서 실습실 선택 콤보박스와 PC 번호 선택 콤보박스를 통해 입력받는 2단 ComboBox 설정 창
    def prompt_classroom_and_pc(self, default_room="ai_1", default_pc="1"):

        if not is_windows:
            return "ai_1|1"
        
        ps_cmd = (
            "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; "
            "$form = New-Object Windows.Forms.Form; "
            "$form.Text = 'Minito 실습실 PC 설정'; "
            "$form.Size = New-Object Drawing.Size(340, 290); "
            "$form.StartPosition = 'CenterScreen'; "
            "$form.FormBorderStyle = 'FixedDialog'; "
            "$form.MaximizeBox = $false; "
            "$form.MinimizeBox = $false; "
            "$form.TopMost = $true; "
            
            # 1. 실습실 선택 콤보박스
            "$lbl1 = New-Object Windows.Forms.Label; "
            "$lbl1.Text = '1. 관제 대상 실습실 선택'; "
            "$lbl1.Location = New-Object Drawing.Point(20, 15); "
            "$lbl1.Size = New-Object Drawing.Size(200, 20); "
            "$lbl1.Font = New-Object Drawing.Font('맑은 고딕', 9, [Drawing.FontStyle]::Bold); "
            "$form.Controls.Add($lbl1); "
            
            "$comboRoom = New-Object Windows.Forms.ComboBox; "
            "$comboRoom.DropDownStyle = [Windows.Forms.ComboBoxStyle]::DropDownList; "
            "$comboRoom.Location = New-Object Drawing.Point(40, 40); "
            "$comboRoom.Size = New-Object Drawing.Size(240, 25); "
            "$comboRoom.Items.Add('AI융합실습실 1실') | Out-Null; "
            "$comboRoom.Items.Add('AI융합실습실 2실') | Out-Null; "
            "$comboRoom.Items.Add('AI융합실습실 3실') | Out-Null; "
            "$comboRoom.Items.Add('AI융합실습실 4실') | Out-Null; "
            
            f"if ('{default_room}' -eq 'ai_2') {{ $comboRoom.SelectedIndex = 1 }} "
            f"elseif ('{default_room}' -eq 'ai_3') {{ $comboRoom.SelectedIndex = 2 }} "
            f"elseif ('{default_room}' -eq 'ai_4') {{ $comboRoom.SelectedIndex = 3 }} "
            "else { $comboRoom.SelectedIndex = 0 } "
            "$form.Controls.Add($comboRoom); "
            
            # 2. PC 번호 선택 콤보박스
            "$lbl2 = New-Object Windows.Forms.Label; "
            "$lbl2.Text = '2. 현재 PC 번호 선택'; "
            "$lbl2.Location = New-Object Drawing.Point(20, 100); "
            "$lbl2.Size = New-Object Drawing.Size(200, 20); "
            "$lbl2.Font = New-Object Drawing.Font('맑은 고딕', 9, [Drawing.FontStyle]::Bold); "
            "$form.Controls.Add($lbl2); "
            
            "$comboPc = New-Object Windows.Forms.ComboBox; "
            "$comboPc.DropDownStyle = [Windows.Forms.ComboBoxStyle]::DropDownList; "
            "$comboPc.Location = New-Object Drawing.Point(40, 125); "
            "$comboPc.Size = New-Object Drawing.Size(240, 25); "
            "for ($i=1; $i -le 100; $i++) { $comboPc.Items.Add($i.ToString() + '번 PC') | Out-Null } "
            
            # 초기 PC 인덱스 바인딩 (default_pc 파싱)
            f"$pcIdx = [int]'{default_pc}' - 1; "
            "if ($pcIdx -ge 0 -and $pcIdx -lt 100) { $comboPc.SelectedIndex = $pcIdx } else { $comboPc.SelectedIndex = 0 } "
            "$form.Controls.Add($comboPc); "
            
            # 3. 하단 버튼 컨트롤
            "$btnOk = New-Object Windows.Forms.Button; $btnOk.Text = '설정 완료'; $btnOk.Location = New-Object Drawing.Point(60, 195); $btnOk.DialogResult = [Windows.Forms.DialogResult]::OK; $form.AcceptButton = $btnOk; $form.Controls.Add($btnOk); "
            "$btnCancel = New-Object Windows.Forms.Button; $btnCancel.Text = '취소'; $btnCancel.Location = New-Object Drawing.Point(170, 195); $btnCancel.DialogResult = [Windows.Forms.DialogResult]::Cancel; $form.CancelButton = $btnCancel; $form.Controls.Add($btnCancel); "
            
            "$res = $form.ShowDialog(); "
            "if ($res -eq [Windows.Forms.DialogResult]::OK) { "
            "  $room = 'ai_1'; "
            "  if ($comboRoom.SelectedIndex -eq 1) { $room = 'ai_2' } "
            "  elseif ($comboRoom.SelectedIndex -eq 2) { $room = 'ai_3' } "
            "  elseif ($comboRoom.SelectedIndex -eq 3) { $room = 'ai_4' } "
            # 선택 완료 시 숫자 부분만 발췌하기 위해 '번 PC' 제거 처리
            "  $selectedPcStr = $comboPc.SelectedItem.ToString().Replace('번 PC', '').Trim(); "
            "  Write-Output ($room + '|' + $selectedPcStr) "
            "}"
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


    # 단일 화면의 설정을 띄운 뒤 변경 처리
    def show(self, is_reconfigure=False):
        # 기존 설정 정보 백업해서 default_val로 전달
        curr_room = self.config_manager.config.get("classroom_id", "ai_1") or "ai_1"
        curr_pc = self.config_manager.config.get("pc_number", "1") or "1"

        # 1. 단일 설정 통합 창 기동
        result = self.prompt_classroom_and_pc(curr_room, curr_pc)
        
        # 사용자가 취소(Cancel)를 누르거나 X를 눌러 나간 경우 프로세스를 안전하게 종료
        if not result or "|" not in result:
            print("[설정] 사용자에 의해 설정이 취소되었습니다. 프로세스를 강제 종료합니다.")
            sys.exit(0)

        # 결과 파싱
        room, pc_number = result.split("|", 1)
        pc_number = pc_number.strip()
        
        if not pc_number:
            self.show_error("PC 번호는 필수 입력 사항입니다.")
            sys.exit(1)

        # 설정 파일 저장 및 시작프로그램 자동 등록
        if self.config_manager.save(room, f"PC_{pc_number}", f"PC {pc_number}", pc_number):
            self.config_manager.register_to_startup()
            if is_reconfigure:
                self.show_info("설정이 성공적으로 변경되었습니다.\n서버 대시보드와 즉각 동기화를 수행합니다.")
                if self.on_config_changed:
                    self.on_config_changed()
            else:
                self.show_info("Minito Agent 설치 및 설정이 완료되었습니다.\n부팅 시 백그라운드에서 자동 구동됩니다.")
        else:
            self.show_error("설정 파일 저장에 실패했습니다.")
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
