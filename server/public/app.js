// ClassGuard Client Dashboard App Logic

const socket = io();

// DOM 요소 참조
const studentsGrid = document.getElementById('students-grid');
const statTotal = document.getElementById('stat-total');
const statOnline = document.getElementById('stat-online');
const txtClassroomId = document.getElementById('txt-classroom-id');
const btnConfigClassroom = document.getElementById('btn-config-classroom');
const configModal = document.getElementById('config-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const btnSaveModal = document.getElementById('btn-save-modal');
const inputClassroomId = document.getElementById('input-classroom-id');

// 카드 엘리먼트 캐시 (socket.id -> DOM Element)
const activeCards = {};

// 1. 소켓 연결 핸들러
socket.on('connect', () => {
  console.log('[Dashboard] 서버 소켓 연결 성공:', socket.id);
  // 대시보드로 역할 등록
  socket.emit('register_dashboard');
});

// 2. 소켓 이벤트 수신
// 최초 로드 시 전체 학생 목록
socket.on('student_list', (studentList) => {
  console.log('[Dashboard] 학생 목록 로드됨:', studentList);
  studentsGrid.innerHTML = '';
  
  if (studentList.length === 0) {
    showEmptyState();
  } else {
    studentList.forEach(student => {
      renderStudentCard(student);
    });
  }
  updateStats();
});

// 신규 학생 접속
socket.on('student_connected', (student) => {
  console.log('[Dashboard] 학생 접속:', student);
  // 기존에 그려진 '대기 중' 안내 메시지 제거
  const emptyState = studentsGrid.querySelector('.no-students');
  if (emptyState) {
    studentsGrid.innerHTML = '';
  }
  
  renderStudentCard(student);
  updateStats();
});

// 학생 접속 종료
socket.on('student_disconnected', (data) => {
  console.log('[Dashboard] 학생 연결 해제:', data);
  const card = activeCards[data.socket_id];
  if (card) {
    // 카드를 완전히 지우지 않고 오프라인 상태 경고 스타일링 처리
    card.classList.add('offline');
    const statusText = card.querySelector('.status-text');
    if (statusText) statusText.textContent = '오프라인';
    
    // 프로세스 리스트 초기화
    const procListDiv = card.querySelector('.process-list');
    if (procListDiv) {
      procListDiv.innerHTML = '<span class="no-bad-apps"><i data-lucide="alert-triangle" style="width:0.8rem;height:0.8rem;"></i>통신 두절됨</span>';
      lucide.createIcons();
    }
  }
  updateStats();
});

// 화면 업데이트
socket.on('screen_data', (data) => {
  const card = activeCards[data.socket_id];
  if (card) {
    // 오프라인 상태였다면 해제
    if (card.classList.contains('offline')) {
      card.classList.remove('offline');
      const statusText = card.querySelector('.status-text');
      if (statusText) statusText.textContent = '실시간';
    }
    
    const imgElement = card.querySelector('.screen-img');
    const placeholder = card.querySelector('.screen-placeholder');
    
    if (imgElement) {
      imgElement.src = data.image;
      imgElement.style.opacity = 1;
    }
    if (placeholder) {
      placeholder.style.display = 'none';
    }
  }
});

// 프로세스 목록 업데이트
socket.on('process_update', (data) => {
  const card = activeCards[data.socket_id];
  if (card) {
    const procListDiv = card.querySelector('.process-list');
    if (procListDiv) {
      procListDiv.innerHTML = '';
      const processes = data.processes || [];
      
      if (processes.length === 0) {
        procListDiv.innerHTML = '<span class="no-bad-apps"><i data-lucide="check-circle" style="width:0.8rem;height:0.8rem;color:#10b981;"></i>안심 상태 (딴짓 없음)</span>';
      } else {
        processes.forEach(proc => {
          const chip = document.createElement('div');
          chip.className = 'process-chip';
          // 윈도우 제목이 너무 길면 자름
          const displayTitle = proc.title.length > 12 ? proc.title.substring(0, 12) + '...' : proc.title;
          chip.innerHTML = `
            <span title="${proc.title} (${proc.name})">${displayTitle}</span>
            <button class="btn-kill" data-socket-id="${data.socket_id}" data-proc-name="${proc.name}" title="종료 명령 전송">
              <i data-lucide="x"></i>
            </button>
          `;
          
          // 강제 종료 버튼 바인딩
          chip.querySelector('.btn-kill').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const targetSocketId = btn.getAttribute('data-socket-id');
            const processName = btn.getAttribute('data-proc-name');
            
            // 시각적 피드백 제공 (버튼 회전 및 투명도)
            btn.style.opacity = '0.5';
            btn.disabled = true;
            
            console.log(`[Dashboard] 강제 종료 이벤트 전송: ${targetSocketId} -> ${processName}`);
            socket.emit('kill_process', { targetSocketId, processName });
          });
          
          procListDiv.appendChild(chip);
        });
      }
      // 아이콘 새로고침
      lucide.createIcons();
    }
  }
});

// 3. 학생 카드 렌더링 함수
function renderStudentCard(student) {
  // 이미 생성된 카드가 있다면 재사용하고 상태만 갱신
  if (activeCards[student.socket_id]) {
    const existingCard = activeCards[student.socket_id];
    existingCard.classList.remove('offline');
    const nameEl = existingCard.querySelector('.student-name');
    const metaEl = existingCard.querySelector('.student-id-pc');
    if (nameEl) nameEl.textContent = student.student_name;
    if (metaEl) metaEl.textContent = `${student.student_id} • PC ${student.pc_number}`;
    return;
  }

  // 카드 컴포넌트 동적 생성
  const card = document.createElement('div');
  card.className = 'student-card';
  card.id = `card-${student.socket_id}`;
  
  card.innerHTML = `
    <!-- 카드 헤더 -->
    <div class="card-header">
      <div class="student-meta">
        <span class="student-name">${student.student_name}</span>
        <span class="student-id-pc">${student.student_id} • PC ${student.pc_number}</span>
      </div>
      <div class="status-indicator">
        <span class="status-dot"></span>
        <span class="status-text">실시간</span>
      </div>
    </div>
    
    <!-- 화면 피드 영역 -->
    <div class="screen-feed">
      <div class="screen-placeholder">
        <i data-lucide="loader" class="animate-spin" style="animation: spin 1.5s linear infinite;"></i>
        <span>첫 화면 대기 중</span>
      </div>
      <img src="" alt="Student Screen" class="screen-img" style="opacity: 0;">
    </div>
    
    <!-- 카드 푸터 (프로세스 목록) -->
    <div class="card-footer">
      <span class="footer-title">의심스러운 실행 프로그램</span>
      <div class="process-list">
        <span class="no-bad-apps">
          <i data-lucide="loader" style="width:0.8rem;height:0.8rem;animation: spin 1.5s linear infinite;"></i>대기 중...
        </span>
      </div>
    </div>
  `;

  studentsGrid.appendChild(card);
  activeCards[student.socket_id] = card;
  lucide.createIcons();
}

// 4. 대기 상태 안내창 그리기
function showEmptyState() {
  studentsGrid.innerHTML = `
    <div class="no-students">
      <i data-lucide="monitor-off" class="empty-icon"></i>
      <p>접속 대기 중...</p>
      <span class="empty-sub">학생 PC에서 에이전트를 가동해 주세요.</span>
    </div>
  `;
  lucide.createIcons();
}

// 5. 통계 정보 업데이트
function updateStats() {
  const cards = Object.values(activeCards);
  const total = cards.length;
  const online = cards.filter(card => !card.classList.contains('offline')).length;
  
  statTotal.textContent = total;
  statOnline.textContent = online;
}

// 6. 강의실 설정 모달 제어
btnConfigClassroom.addEventListener('click', () => {
  inputClassroomId.value = txtClassroomId.textContent.trim();
  configModal.classList.add('active');
});

const closeModal = () => {
  configModal.classList.remove('active');
};

btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

// 설정 변경 저장 API 호출
btnSaveModal.addEventListener('click', async () => {
  const newId = inputClassroomId.value.trim();
  if (!newId) return alert('강의실 번호를 입력해주세요.');

  try {
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ classroom_id: newId })
    });
    
    const result = await response.json();
    if (result.success) {
      txtClassroomId.textContent = result.classroom_id;
      closeModal();
    } else {
      alert('설정 변경에 실패했습니다.');
    }
  } catch (err) {
    console.error('설정 저장 실패:', err);
    alert('서버와의 통신 오류가 발생했습니다.');
  }
});

// 아이콘 렌더링
lucide.createIcons();
