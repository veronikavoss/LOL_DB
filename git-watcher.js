const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 감시할 디렉토리 경로 (프로젝트 루트)
const watchDir = __dirname;

// 제외할 경로 패턴 (윈도우/맥 경로 통일을 위해 슬래시 기준으로 통일하여 대조)
const excludePatterns = [
  /\/\.git\//,
  /\.git$/,
  /\/node_modules\//,
  /node_modules$/,
  /git-watcher\.js$/,
  /\.log$/,
  /temp/i
];

let debounceTimeout = null;
const DEBOUNCE_DELAY = 3000; // 3초 대기 (저장 작업이 완료될 시간 확보)

console.log('==================================================');
console.log('LOL_DB GitHub 자동 동기화 프로그램이 시작되었습니다.');
console.log(`감시 대상 디렉토리: ${watchDir}`);
console.log('파일 변경 시 자동으로 깃허브(GitHub)에 업로드됩니다.');
console.log('==================================================\n');

// 깃 명령 실행 함수
function runGitCommands(changedFiles) {
  const fileListStr = Array.from(changedFiles).join(', ');
  const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const commitMessage = `Auto-commit: ${fileListStr} (수정 시간: ${timestamp})`;

  console.log(`[${timestamp}] 변경 감지: ${fileListStr}`);
  console.log('깃허브 자동 푸시 작업을 시작합니다...');

  // 1. git add
  exec('git add .', { cwd: watchDir }, (err, stdout, stderr) => {
    if (err) {
      console.error('git add 실패:', err);
      return;
    }

    // 2. git commit (변경 사항이 실제로 있을 때만 진행하기 위해 status 확인 후 진행 혹은 무조건 commit 시도)
    exec(`git commit -m "${commitMessage}"`, { cwd: watchDir }, (err, stdout, stderr) => {
      // 변경 사항이 없는 경우(에러 코드가 발생할 수 있음) 예외 처리
      if (err && !stdout.includes('nothing to commit')) {
        // 실제 에러가 아니거나 이미 반영된 경우일 수 있으므로 로그 확인
        if (stdout.includes('On branch') && stdout.includes('nothing to commit')) {
          console.log('새로 커밋할 변경 사항이 없습니다.');
          return;
        }
        console.log('커밋 진행 또는 생략 (변경 사항 확인 필요):', stdout || stderr);
      } else {
        console.log('성공적으로 커밋이 완료되었습니다.');
        console.log(stdout.trim());
      }

      // 3. git push
      console.log('원격 저장소(GitHub)로 푸시 중입니다...');
      exec('git push origin main', { cwd: watchDir }, (err, stdout, stderr) => {
        if (err) {
          console.error('git push 실패:', err);
          console.error(stderr);
          return;
        }
        console.log('==================================================');
        console.log(`[${new Date().toLocaleTimeString('ko-KR')}] 깃허브 푸시가 성공적으로 완료되었습니다.`);
        console.log('==================================================\n');
      });
    });
  });
}

const changedFilesQueue = new Set();

// 재귀적으로 디렉토리 내 모든 파일을 감시하는 함수 (간이 구현)
function watchDirectory(dirPath) {
  try {
    fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const fullPath = path.join(dirPath, filename);

      // 모든 경로 구분자를 슬래시로 통일하여 정밀 필터링
      const normalizedPath = fullPath.replace(/\\/g, '/');

      // 제외할 패턴인지 확인
      const shouldExclude = excludePatterns.some(pattern => pattern.test(normalizedPath));
      if (shouldExclude) return;

      // 파일 변경 사항 큐에 등록
      changedFilesQueue.add(path.basename(filename));

      // 디바운스 처리
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(() => {
        const filesToProcess = new Set(changedFilesQueue);
        changedFilesQueue.clear();
        if (filesToProcess.size > 0) {
          runGitCommands(filesToProcess);
        }
      }, DEBOUNCE_DELAY);
    });
  } catch (error) {
    console.error(`디렉토리 감시 중 오류 발생 (${dirPath}):`, error);
  }
}

// 감시 시작
watchDirectory(watchDir);
