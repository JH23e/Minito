const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const workingDir = path.join(__dirname, '..');
const tempPythonDir = path.join(workingDir, 'temp_python');
const zipPath = path.join(workingDir, 'python_embed.zip');
const agentDir = path.join(workingDir, 'agent');

// 안전한 파일 다운로드 유틸리티
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`다운로드 실패: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

// 윈도우 동기식 명령어 실행
function runCmd(cmd, cwd = workingDir) {
    try {
        execSync(cmd, { cwd, stdio: 'inherit' });
        return true;
    } catch (e) {
        console.error(`명령어 실패: ${cmd}\n에러: ${e.message}`);
        return false;
    }
}

async function main() {
    console.log("[0/7] 기존 실행 중인 빌드 대상 프로세스 강제 사살 (파일 락 해제)...");
    try { execSync('taskkill /F /IM Minito_student_setup.exe /T 2>nul'); } catch(e){}
    try { execSync('taskkill /F /IM Minito_student.exe /T 2>nul'); } catch(e){}
    try { execSync('taskkill /F /IM Minito_student_uninstall.exe /T 2>nul'); } catch(e){}
    
    // 프로세스 릴리즈 대기
    execSync('powershell Start-Sleep -s 1');

    console.log("[1/7] 임시 작업 폴더 생성 중...");
    if (fs.existsSync(tempPythonDir)) {
        fs.rmSync(tempPythonDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempPythonDir, { recursive: true });

    console.log("[2/7] Python 3.10.11 Embedded 버전 다운로드 및 압축 해제...");
    const pythonUrl = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip";
    await downloadFile(pythonUrl, zipPath);
    
    // 파워쉘 압축 해제 구동 (Node.js를 통해 1회성 구동하므로 세션 락 걱정 없음)
    runCmd(`powershell Expand-Archive -Path "${zipPath}" -DestinationPath "${tempPythonDir}" -Force`);
    fs.unlinkSync(zipPath);

    // Embedded 파이썬 import site 활성화
    const pthPath = path.join(tempPythonDir, 'python310._pth');
    if (fs.existsSync(pthPath)) {
        let content = fs.readFileSync(pthPath, 'utf8');
        content = content.replace('#import site', 'import site');
        fs.writeFileSync(pthPath, content, 'utf8');
        console.log("import site 활성화 완료.");
    }

    console.log("[3/7] pip 설치...");
    const getPipUrl = "https://bootstrap.pypa.io/get-pip.py";
    const getPipPath = path.join(tempPythonDir, 'get-pip.py');
    await downloadFile(getPipUrl, getPipPath);
    
    const pythonExe = path.join(tempPythonDir, 'python.exe');
    runCmd(`"${pythonExe}" "${getPipPath}" --no-warn-script-location`);
    fs.unlinkSync(getPipPath);

    console.log("[4/7] 의존성 라이브러리 및 PyInstaller 설치...");
    const pipExe = path.join(tempPythonDir, 'Scripts', 'pip.exe');
    const reqPath = path.join(agentDir, 'requirements.txt');
    runCmd(`"${pipExe}" install --no-warn-script-location -r "${reqPath}" pyinstaller`);

    // ----------------------------------------------------
    // 5. 개별 컴파일 (에이전트 -> 언인스톨러 -> 인스톨러 패키징)
    // ----------------------------------------------------
    const pyinstallerExe = path.join(tempPythonDir, 'Scripts', 'pyinstaller.exe');
    const buildPath = path.join(agentDir, 'build');
    const distPath = path.join(agentDir, 'dist');

    console.log("[5-1/7] 에이전트 핵심 파일 Minito_student.exe 컴파일...");
    const agentPy = path.join(agentDir, 'agent.py');
    runCmd(`"${pyinstallerExe}" --onefile --noconsole --name Minito_student --workpath "${buildPath}" --distpath "${distPath}" "${agentPy}"`);

    console.log("[5-2/7] 언인스톨러 Minito_student_uninstall.exe 컴파일...");
    const uninstallPy = path.join(agentDir, 'uninstall_student.py');
    runCmd(`"${pyinstallerExe}" --onefile --noconsole --name Minito_student_uninstall --workpath "${buildPath}" --distpath "${distPath}" "${uninstallPy}"`);

    console.log("[5-3/7] 최종 통합 설치 패키지 Minito_student_setup.exe 빌드...");
    const setupPy = path.join(agentDir, 'setup_student.py');
    const addDataAgent = `${path.join(distPath, 'Minito_student.exe')};.`;
    const addDataUninstall = `${path.join(distPath, 'Minito_student_uninstall.exe')};.`;
    runCmd(`"${pyinstallerExe}" --onefile --noconsole --name Minito_student_setup --add-data "${addDataAgent}" --add-data "${addDataUninstall}" --workpath "${buildPath}" --distpath "${distPath}" "${setupPy}"`);

    // ----------------------------------------------------
    // 6. 임시 리소스 및 부산물 청소
    // ----------------------------------------------------
    console.log("[6/7] 빌드 임시 흔적 청소...");
    if (fs.existsSync(tempPythonDir)) fs.rmSync(tempPythonDir, { recursive: true, force: true });
    if (fs.existsSync(buildPath)) fs.rmSync(buildPath, { recursive: true, force: true });
    
    const spec1 = path.join(workingDir, 'Minito_student.spec');
    const spec2 = path.join(workingDir, 'Minito_student_uninstall.spec');
    const spec3 = path.join(workingDir, 'Minito_student_setup.spec');
    if (fs.existsSync(spec1)) fs.unlinkSync(spec1);
    if (fs.existsSync(spec2)) fs.unlinkSync(spec2);
    if (fs.existsSync(spec3)) fs.unlinkSync(spec3);

    // 최종 번들링 인스톨러(setup)만 남기고 내부 원본 exe 삭제
    const agentExe = path.join(distPath, 'Minito_student.exe');
    const uninstallExe = path.join(distPath, 'Minito_student_uninstall.exe');
    if (fs.existsSync(agentExe)) fs.unlinkSync(agentExe);
    if (fs.existsSync(uninstallExe)) fs.unlinkSync(uninstallExe);

    console.log("[7/7] 완료! Minito_student_setup.exe 설치형 빌드가 성공했습니다!");
}

main().catch(err => {
    console.error("빌드 도중 예외 오류 발생:", err);
    process.exit(1);
});
