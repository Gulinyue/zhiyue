// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.
import { getResume, parsePracticeResumeDocument, confirmParsedResume, listPracticeJobs, getPracticeJob, matchPracticeJobs, createPracticeJob, updatePracticeJob, deletePracticeJob, discoverPracticeJobs, recordPracticeJobRecommendationClick, recordPracticeJobSelection, readPracticeSpeechVoicePreference, createPracticeQuestionSpeechGate, resolvePracticeSpeechVoice, getPracticeSession, listPracticeSpeechVoices, startPracticeSpeechPlayback, requestPracticeSessionTurnSpeech, requestPracticeSpeechPreview, normalizeResumeProfile, parsedJdToCreateInput, ensureStartedPracticeSession, createPracticeSession, startPracticeSession, streamPracticeSessionAgentStep, finalizePracticeSessionTurn, abandonPracticeSession, finishPracticeSession, requestPracticeClosingSpeech, persistPracticeReportChoice, requestPracticeSessionReport, connectAsrStream, startPcmCapture, resolvePracticeAgentPublicWaitStage, practiceAgentWaitMessages, PRACTICE_AGENT_WAIT_ROTATION_MS, practiceAgentWaitMessage, listPracticeSessions } from "../services/task-runtime.mjs";
import { reactExports, jsxRuntimeExports, s$4, m, s$3, s$9, n$2, f, n, i$3, s$8, a$1, n$1, h$1, n$6, s$a, s$1, c$1, c$3, i$4, i$2, m$1, n$3, n$4, i$1, c$2, m$3, s$7 } from "../vendor/react-icons-state.mjs";

const RESUME_ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,.md,.markdown,application/pdf,image/png,image/jpeg,text/plain,text/markdown";
const JD_ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,.md,.markdown,application/pdf,image/png,image/jpeg,text/plain,text/markdown";
const MAX_JD_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const DIFFICULTIES = ["正常面", "压力面"];
const INTERVIEWERS = ["HR 面试官", "CEO 面试官", "CTO 面试官", "业务负责人", "直属上级"];
const QUESTION_COUNTS = [5, 8, 10];
const DURATION_MINUTES = [15, 30, 45, 60];
const HOME_PROMPTS = [
  "我想练一场高级前端工程师面试",
  "我想转向 AI 产品经理",
  "根据我的简历推荐一个岗位"
];
const ACTIVE_PRACTICE_SESSION_KEY = "climb.practice.activeSessionId";
const PRACTICE_SESSION_RESTORE_TIMEOUT_MS = 15e3;
const PRACTICE_JOB_SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_CONFIG = {
  targetRole: "",
  jobDescription: "",
  difficulty: "正常面",
  interviewer: "直属上级",
  // Kept only for restoring legacy snapshots; Agent interviews do not stop at
  // a renderer-selected fixed question count.
  questionCount: 8,
  durationMinutes: 30,
  submissionMode: "manual"
};
const EXPERIENCE_FILTERS = [
  { label: "经验不限", value: "" },
  { label: "应届 / 1年内", value: "0" },
  { label: "1-3年", value: "1" },
  { label: "3-5年", value: "3" },
  { label: "5年以上", value: "5" }
];
const EMPLOYMENT_TYPE_FILTERS = ["全职", "实习"];
const EDUCATION_FILTERS = ["高中", "大专", "本科", "硕士", "博士"];
const SALARY_FILTERS = [
  { label: "10K以下", value: "under_10k" },
  { label: "10-20K", value: "10_20k" },
  { label: "20-50K", value: "20_50k" },
  { label: "50K以上", value: "over_50k" }
];
const PracticeInterviewPage = (props) => {
  const {
    initialResume,
    loadResume = getResume,
    uploadResumeFile,
    parseResumeFile = parsePracticeResumeDocument,
    confirmResumeFile = confirmParsedResume,
    initialJobs,
    loadJobs = listPracticeJobs,
    loadJob = getPracticeJob,
    matchJobs = matchPracticeJobs,
    createJob = createPracticeJob,
    updateJob = updatePracticeJob,
    deleteJob = deletePracticeJob,
    discoverJobs = (input) => discoverPracticeJobs({
      messages: input.messages,
      uploadedJob: input.uploadedJob,
      attachment: input.attachment,
      discoverySessionId: input.discoverySessionId,
      command: input.command,
      limit: 6
    }),
    recordJobClick = recordPracticeJobRecommendationClick,
    recordJobSelection = recordPracticeJobSelection,
    onResumeChanged,
    onOpenResume,
    onOpenPracticeHistory
  } = props;
  const hasInitialResume = initialResume !== void 0;
  const hasInitialJobs = initialJobs !== void 0;
  const [phase, setPhase] = reactExports.useState("setup");
  const [resume, setResume] = reactExports.useState(initialResume ?? null);
  const [resumeLoading, setResumeLoading] = reactExports.useState(!hasInitialResume);
  const [resumeUploading, setResumeUploading] = reactExports.useState(false);
  const [resumeConfirming, setResumeConfirming] = reactExports.useState(false);
  const [parsedResume, setParsedResume] = reactExports.useState(null);
  const [config, setConfig] = reactExports.useState(DEFAULT_CONFIG);
  const [jobs, setJobs] = reactExports.useState(() => sortPracticeJobsByTitle(initialJobs ?? []));
  const [jobsLoading, setJobsLoading] = reactExports.useState(!hasInitialJobs);
  const [jobsLoadingMore, setJobsLoadingMore] = reactExports.useState(false);
  const [jobsNextCursor, setJobsNextCursor] = reactExports.useState(null);
  const [jobsError, setJobsError] = reactExports.useState(null);
  const [catalogSearchDraft, setCatalogSearchDraft] = reactExports.useState("");
  const [catalogSearch, setCatalogSearch] = reactExports.useState("");
  const [catalogSource, setCatalogSource] = reactExports.useState("preset");
  const [experienceFilter, setExperienceFilter] = reactExports.useState("");
  const [educationFilter, setEducationFilter] = reactExports.useState("");
  const [employmentFilter, setEmploymentFilter] = reactExports.useState("全职");
  const [salaryFilter, setSalaryFilter] = reactExports.useState("");
  const [catalogSort, setCatalogSort] = reactExports.useState("title");
  const [matchDraft, setMatchDraft] = reactExports.useState("");
  const [matchLoading, setMatchLoading] = reactExports.useState(false);
  const [pendingJdFile, setPendingJdFile] = reactExports.useState(null);
  const [matchMessages, setMatchMessages] = reactExports.useState([]);
  const [recommendations, setRecommendations] = reactExports.useState([]);
  const [recommendationSearchId, setRecommendationSearchId] = reactExports.useState("");
  const [discoverySessionId, setDiscoverySessionId] = reactExports.useState("");
  const [discoveryUploadedJob, setDiscoveryUploadedJob] = reactExports.useState(null);
  const [discoveryJobDraft, setDiscoveryJobDraft] = reactExports.useState(null);
  const [discoveryJobDraftOpen, setDiscoveryJobDraftOpen] = reactExports.useState(false);
  const [discoveryJobDraftSaving, setDiscoveryJobDraftSaving] = reactExports.useState(false);
  const [discoveryJobDraftError, setDiscoveryJobDraftError] = reactExports.useState(null);
  const [customJobForm, setCustomJobForm] = reactExports.useState(null);
  const [customJobSaving, setCustomJobSaving] = reactExports.useState(false);
  const [customJobError, setCustomJobError] = reactExports.useState(null);
  const [deleteJobTarget, setDeleteJobTarget] = reactExports.useState(null);
  const [customJobDeleting, setCustomJobDeleting] = reactExports.useState(false);
  const [deleteJobError, setDeleteJobError] = reactExports.useState(null);
  const [jobPreview, setJobPreview] = reactExports.useState(null);
  const [jobPreviewRecommendationSearchId, setJobPreviewRecommendationSearchId] = reactExports.useState("");
  const [jobPreviewLoading, setJobPreviewLoading] = reactExports.useState(false);
  const [selectedJob, setSelectedJob] = reactExports.useState(null);
  const [exchanges, setExchanges] = reactExports.useState([]);
  const [currentQuestion, setCurrentQuestion] = reactExports.useState("");
  const [currentQuestionSequence, setCurrentQuestionSequence] = reactExports.useState(null);
  const [draftAnswer, setDraftAnswer] = reactExports.useState("");
  const [questionLoading, setQuestionLoading] = reactExports.useState(false);
  const [agentStepStage, setAgentStepStage] = reactExports.useState("thinking");
  const [reportLoading, setReportLoading] = reactExports.useState(false);
  const [report, setReport] = reactExports.useState(null);
  const [error2, setError] = reactExports.useState(null);
  const [autoSpeak, setAutoSpeak] = reactExports.useState(true);
  const [speechVoices, setSpeechVoices] = reactExports.useState([]);
  const [speechVoiceId] = reactExports.useState(() => readPracticeSpeechVoicePreference());
  const [cameraEnabled, setCameraEnabled] = reactExports.useState(true);
  const [answerMode, setAnswerMode] = reactExports.useState("voice");
  const [microphoneStatus, setMicrophoneStatus] = reactExports.useState("idle");
  const [microphoneLevel, setMicrophoneLevel] = reactExports.useState(null);
  const [cameraStatus, setCameraStatus] = reactExports.useState("idle");
  const [speakerStatus, setSpeakerStatus] = reactExports.useState("idle");
  const [deviceChecking, setDeviceChecking] = reactExports.useState(false);
  const [interviewStarting, setInterviewStarting] = reactExports.useState(false);
  const [preservedSessionAvailable, setPreservedSessionAvailable] = reactExports.useState(false);
  const [preservedFinishConfirmOpen, setPreservedFinishConfirmOpen] = reactExports.useState(false);
  const [recording, setRecording] = reactExports.useState(false);
  const [voiceConnecting, setVoiceConnecting] = reactExports.useState(false);
  const [ttsSpeaking, setTtsSpeaking] = reactExports.useState(false);
  const [ttsPlaybackPhase, setTtsPlaybackPhase] = reactExports.useState("idle");
  const requestAbortRef = reactExports.useRef(null);
  const asrStreamRef = reactExports.useRef(null);
  const pcmCaptureRef = reactExports.useRef(null);
  const pcmStartupAbortRef = reactExports.useRef(null);
  const microphoneStreamRef = reactExports.useRef(null);
  const preparationMicrophoneRef = reactExports.useRef(null);
  const preparationCameraRef = reactExports.useRef(null);
  const preparationVideoRef = reactExports.useRef(null);
  const interviewVideoRef = reactExports.useRef(null);
  const preparationRunRef = reactExports.useRef(0);
  const voiceRunRef = reactExports.useRef(0);
  const ttsRunRef = reactExports.useRef(0);
  const ttsPlaybackRef = reactExports.useRef(null);
  const autoQuestionSpeechGateRef = reactExports.useRef(createPracticeQuestionSpeechGate());
  const autoSpeakRef = reactExports.useRef(autoSpeak);
  const interviewerRef = reactExports.useRef(config.interviewer);
  const answerRef = reactExports.useRef(null);
  const [sessionStartedAt, setSessionStartedAt] = reactExports.useState(null);
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = reactExports.useState(0);
  const [sessionPaused, setSessionPaused] = reactExports.useState(false);
  const sessionPausedRef = reactExports.useRef(sessionPaused);
  function cancelPcmCaptureStartup() {
    pcmStartupAbortRef.current?.abort();
    pcmStartupAbortRef.current = null;
  }
  const [practiceSessionId, setPracticeSessionId] = reactExports.useState(null);
  const [, setSessionResumeContext] = reactExports.useState("");
  const [turnSaving, setTurnSaving] = reactExports.useState(false);
  const [sessionRestoring, setSessionRestoring] = reactExports.useState(false);
  const sessionPauseStartedAtRef = reactExports.useRef(null);
  const pageLifecycleRef = reactExports.useRef(0);
  const restoredQuestionContinuationRef = reactExports.useRef(null);
  const interviewStartLockRef = reactExports.useRef(false);
  const jobsLoadMoreLockRef = reactExports.useRef(false);
  const jobsQueryGenerationRef = reactExports.useRef(0);
  const skipInitialJobsLoadRef = reactExports.useRef(hasInitialJobs);
  const discoveryGenerationRef = reactExports.useRef(0);
  const jobPreviewGenerationRef = reactExports.useRef(0);
  autoSpeakRef.current = autoSpeak;
  interviewerRef.current = config.interviewer;
  sessionPausedRef.current = sessionPaused;
  const answeredCount = exchanges.length;
  const questionNumber = answeredCount + 1;
  const progress = phase === "report" ? 100 : Math.min(96, Math.round(sessionElapsedSeconds / Math.max(1, config.durationMinutes * 60) * 100));
  const conversationActive = matchMessages.length > 0 || matchLoading || recommendations.length > 0;
  const selectedSpeechVoice = resolvePracticeSpeechVoice(speechVoices, speechVoiceId);
  const devicesReady = arePracticeDevicesReady(
    answerMode,
    microphoneStatus,
    cameraEnabled,
    cameraStatus,
    speakerStatus
  );
  reactExports.useEffect(() => {
    if (initialResume === void 0) return;
    setResume(initialResume);
    setResumeLoading(false);
  }, [initialResume]);
  reactExports.useEffect(() => {
    if (hasInitialResume) return;
    let cancelled = false;
    setResumeLoading(true);
    void loadResume().then((value) => {
      if (cancelled) return;
      setResume(value);
      onResumeChanged?.(value);
    }).catch((reason) => {
      if (!cancelled) setError(errorMessage(reason, "加载简历失败，请稍后重试"));
    }).finally(() => {
      if (!cancelled) setResumeLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hasInitialResume, loadResume, onResumeChanged]);
  reactExports.useEffect(() => {
    if (resumeLoading || typeof window === "undefined") return;
    const activeSessionId = readActivePracticeSessionId();
    if (!activeSessionId) return;
    let cancelled = false;
    const controller = new AbortController();
    let restoreTimedOut = false;
    const timeout = window.setTimeout(() => {
      restoreTimedOut = true;
      controller.abort(new DOMException("Practice session restore timed out", "TimeoutError"));
    }, PRACTICE_SESSION_RESTORE_TIMEOUT_MS);
    setPracticeSessionId(activeSessionId);
    setSessionRestoring(true);
    void getPracticeSession(activeSessionId, void 0, controller.signal).then(async (session) => {
      if (cancelled) return;
      if (session.status === "finished") {
        const recovery = resolveFinishedPracticeRecovery(
          session.reportChoice,
          session.report?.status ?? null,
          Boolean(session.report?.content)
        );
        if (recovery === "discard") {
          clearActivePracticeSessionId();
          setPracticeSessionId(null);
          return;
        }
        if (session.reportChoice === "generate" && onOpenPracticeHistory) {
          clearActivePracticeSessionId();
          setPracticeSessionId(null);
          onOpenPracticeHistory(session.id);
          return;
        }
        await restorePracticeSession(session);
        if (recovery === "report" && session.report?.content) {
          setReport(session.report.content);
          clearActivePracticeSessionId();
          setPhase("report");
        } else if (session.reportChoice === "generate") {
          setError(session.report?.status === "failed" ? "上次复盘生成失败，你可以重新生成" : "复盘已在后台生成；离开页面不会中断任务，可以稍后在面试记录中查看。");
        }
        return;
      }
      await restorePracticeSession(session);
    }).catch((reason) => {
      if (cancelled) return;
      const status = typeof reason === "object" && reason !== null && "status" in reason ? Number(reason.status) : 0;
      if (status === 404) {
        clearActivePracticeSessionId();
        setPracticeSessionId(null);
        setPreservedSessionAvailable(false);
      } else {
        setPreservedSessionAvailable(true);
        setError(restoreTimedOut ? "恢复上次演练超时。会话仍已保留，请检查网络后点击“继续面试”重试。" : errorMessage(reason, "恢复上次演练失败。会话仍已保留，你可以稍后重试。"));
      }
    }).finally(() => {
      window.clearTimeout(timeout);
      if (!cancelled) setSessionRestoring(false);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort(new DOMException("Practice session restore cancelled", "AbortError"));
    };
  }, [resumeLoading]);
  reactExports.useEffect(() => {
    if (sessionRestoring || phase !== "interview" || questionLoading || currentQuestion) return;
    const continuation = restoredQuestionContinuationRef.current;
    if (!continuation || continuation.sessionId !== practiceSessionId) return;
    restoredQuestionContinuationRef.current = null;
    void loadQuestion(
      continuation.nextNumber,
      continuation.sessionId,
      continuation.exchanges
    );
  }, [currentQuestion, phase, practiceSessionId, questionLoading, sessionRestoring]);
  reactExports.useEffect(() => {
    const normalizedSearch = catalogSearchDraft.trim();
    if (normalizedSearch === catalogSearch) return;
    const timer2 = window.setTimeout(() => {
      setCatalogSearch(normalizedSearch);
    }, PRACTICE_JOB_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer2);
  }, [catalogSearch, catalogSearchDraft]);
  reactExports.useEffect(() => {
    if (skipInitialJobsLoadRef.current) {
      skipInitialJobsLoadRef.current = false;
      return;
    }
    const queryGeneration = ++jobsQueryGenerationRef.current;
    let cancelled = false;
    setJobsLoading(true);
    setJobsNextCursor(null);
    setJobsError(null);
    void loadJobs({
      q: catalogSearch || void 0,
      source: catalogSource,
      employmentType: employmentFilter || void 0,
      education: educationFilter || void 0,
      experienceYears: experienceFilter ? Number(experienceFilter) : void 0,
      salaryBand: salaryFilter || void 0,
      sort: catalogSort,
      limit: 24
    }).then((result) => {
      if (cancelled || queryGeneration !== jobsQueryGenerationRef.current) return;
      setJobs(catalogSort === "title" ? sortPracticeJobsByTitle(result.items) : result.items);
      setJobsNextCursor(result.nextCursor);
    }).catch((reason) => {
      if (!cancelled) setJobsError(errorMessage(reason, "加载岗位库失败，请稍后重试"));
    }).finally(() => {
      if (!cancelled) setJobsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogSearch, catalogSort, catalogSource, educationFilter, employmentFilter, experienceFilter, loadJobs, salaryFilter]);
  reactExports.useEffect(() => {
    if (phase !== "interview" || questionLoading || !autoSpeak || sessionPaused || !currentQuestion || currentQuestionSequence === null || !practiceSessionId) return;
    maybeAutoPlayQuestionAudio(currentQuestion, currentQuestionSequence, practiceSessionId);
  }, [autoSpeak, config.interviewer, currentQuestion, currentQuestionSequence, phase, practiceSessionId, questionLoading, sessionPaused]);
  reactExports.useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synthesis = window.speechSynthesis;
    const refresh = () => setSpeechVoices(listPracticeSpeechVoices(synthesis));
    refresh();
    synthesis.addEventListener("voiceschanged", refresh);
    return () => synthesis.removeEventListener("voiceschanged", refresh);
  }, []);
  reactExports.useEffect(() => {
    const lifecycle2 = ++pageLifecycleRef.current;
    return () => {
      if (pageLifecycleRef.current === lifecycle2) pageLifecycleRef.current += 1;
      restoredQuestionContinuationRef.current = null;
      invalidatePracticeAsyncRequests(discoveryGenerationRef);
      invalidatePracticeAsyncRequests(jobPreviewGenerationRef);
      requestAbortRef.current?.abort();
      cancelPcmCaptureStartup();
      voiceRunRef.current += 1;
      preparationRunRef.current += 1;
      ttsRunRef.current += 1;
      ttsPlaybackRef.current?.cancel();
      ttsPlaybackRef.current = null;
      window.speechSynthesis?.cancel();
      stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, microphoneStreamRef.current);
      stopMediaStream(preparationMicrophoneRef.current);
      stopMediaStream(preparationCameraRef.current);
    };
  }, []);
  reactExports.useEffect(() => {
    if (phase !== "prepare" && phase !== "interview") return;
    let cancelled = false;
    const cleanups = [];
    const watch = async (name2, onDenied, onPrompt) => {
      const permissions = navigator.permissions;
      if (!permissions?.query) return;
      try {
        const status = await permissions.query({ name: name2 });
        if (cancelled) return;
        const sync = () => {
          if (status.state === "denied") onDenied();
          else if (status.state === "prompt") onPrompt();
        };
        status.addEventListener("change", sync);
        cleanups.push(() => status.removeEventListener("change", sync));
        sync();
      } catch {
      }
    };
    if (answerMode === "voice") {
      void watch("microphone", () => {
        cancelPcmCaptureStartup();
        voiceRunRef.current += 1;
        stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, microphoneStreamRef.current);
        asrStreamRef.current = null;
        pcmCaptureRef.current = null;
        microphoneStreamRef.current = null;
        setRecording(false);
        setVoiceConnecting(false);
        setMicrophoneStatus("denied");
        setError("麦克风权限已被系统撤销，请重新授权或改用文字回答。");
      }, () => {
        setMicrophoneStatus((current) => current === "granted" ? "idle" : current);
      });
    }
    if (cameraEnabled) {
      void watch("camera", () => {
        stopMediaStream(preparationCameraRef.current);
        preparationCameraRef.current = null;
        if (preparationVideoRef.current) preparationVideoRef.current.srcObject = null;
        if (interviewVideoRef.current) interviewVideoRef.current.srcObject = null;
        setCameraStatus("denied");
        setError("摄像头权限已被系统撤销；可以重新授权，或关闭摄像头继续。");
      }, () => {
        setCameraStatus((current) => current === "granted" ? "idle" : current);
      });
    }
    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [answerMode, cameraEnabled, phase]);
  reactExports.useEffect(() => {
    const video = preparationVideoRef.current;
    if (!video) return;
    video.srcObject = phase === "prepare" && cameraEnabled ? preparationCameraRef.current : null;
    if (video.srcObject) void video.play().catch(() => void 0);
  }, [cameraEnabled, cameraStatus, phase]);
  reactExports.useEffect(() => {
    const video = interviewVideoRef.current;
    if (!video) return;
    video.srcObject = phase === "interview" && cameraEnabled ? preparationCameraRef.current : null;
    if (video.srcObject) void video.play().catch(() => void 0);
  }, [cameraEnabled, cameraStatus, phase]);
  reactExports.useEffect(() => {
    if (phase !== "prepare") return;
    void checkPreparationDevices();
  }, [phase, answerMode, cameraEnabled, autoSpeak]);
  reactExports.useEffect(() => {
    if (phase !== "interview" || sessionStartedAt === null || sessionPaused) return;
    const updateElapsed = () => {
      setSessionElapsedSeconds(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1e3)));
    };
    updateElapsed();
    const timer2 = window.setInterval(updateElapsed, 1e3);
    return () => window.clearInterval(timer2);
  }, [phase, sessionPaused, sessionStartedAt]);
  const updateConfig = (key, value) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };
  function startManagedSpeech(text2, cloudAudio, purpose) {
    ttsPlaybackRef.current?.cancel();
    window.speechSynthesis?.cancel();
    const runId = ++ttsRunRef.current;
    setTtsSpeaking(true);
    setTtsPlaybackPhase("preparing");
    const playback = startPracticeSpeechPlayback({
      cloudAudio,
      fallbackVoice: selectedSpeechVoice?.voice ?? null,
      resolveFallbackVoice: () => resolvePracticeSpeechVoice(
        listPracticeSpeechVoices(
          typeof window === "undefined" ? null : window.speechSynthesis
        ),
        speechVoiceId
      )?.voice ?? null,
      text: text2,
      onStart: () => {
        if (runId === ttsRunRef.current) setTtsPlaybackPhase("playing");
      },
      onFallback: (failure2) => {
        reportPracticeSpeechFailure(purpose, failure2, "attempting");
        setError(practiceSpeechFallbackMessage(failure2, "pending"));
      },
      onComplete: (result) => {
        if (!result.failure || result.provider === "cancelled") return;
        if (result.provider === "local" && result.success) {
          reportPracticeSpeechFailure(purpose, result.failure, true);
          setError(practiceSpeechFallbackMessage(result.failure, true));
          return;
        }
        if (result.success) return;
        const fallbackState = result.provider === "none" ? "unavailable" : false;
        reportPracticeSpeechFailure(purpose, result.failure, fallbackState);
        setError(practiceSpeechFallbackMessage(
          result.failure,
          fallbackState
        ));
      }
    });
    ttsPlaybackRef.current = playback;
    void playback.done.then(() => {
      if (runId !== ttsRunRef.current) return;
      if (ttsPlaybackRef.current === playback) ttsPlaybackRef.current = null;
      setTtsSpeaking(false);
      setTtsPlaybackPhase("idle");
    });
    return playback;
  }
  function playQuestionAudio(text2, sequence, sessionId2, voicePreset = practiceSpeechPreset(interviewerRef.current)) {
    startManagedSpeech(text2, (signal) => {
      return requestPracticeSessionTurnSpeech(
        sessionId2,
        sequence,
        voicePreset,
        void 0,
        { signal }
      );
    }, "question");
  }
  function maybeAutoPlayQuestionAudio(text2, sequence, sessionId2) {
    if (!autoSpeakRef.current || sessionPausedRef.current) return;
    const voicePreset = practiceSpeechPreset(interviewerRef.current);
    if (!autoQuestionSpeechGateRef.current.claim({ sessionId: sessionId2, sequence, voicePreset })) return;
    playQuestionAudio(text2, sequence, sessionId2, voicePreset);
  }
  async function previewCloudSpeech(text2) {
    const playback = startManagedSpeech(
      text2,
      (signal) => requestPracticeSpeechPreview(
        practiceSpeechPreset(config.interviewer),
        void 0,
        { signal }
      ),
      "preview"
    );
    const result = await playback.done;
    return result.provider === "cloud" && result.success;
  }
  function cancelQuestionAudio() {
    ttsRunRef.current += 1;
    ttsPlaybackRef.current?.cancel();
    ttsPlaybackRef.current = null;
    window.speechSynthesis?.cancel();
    setTtsSpeaking(false);
    setTtsPlaybackPhase("idle");
  }
  async function restorePracticeSession(session) {
    autoQuestionSpeechGateRef.current.reset();
    const restoredJob = practiceJobFromSessionSnapshot(session.jobSnapshot);
    const restoredConfig = practiceConfigFromSessionSnapshot(session.configSnapshot, restoredJob);
    const restoredResume = {
      id: session.resumeSnapshot.id,
      fileName: session.resumeSnapshot.fileName,
      fileMime: session.resumeSnapshot.fileMime,
      profile: normalizeResumeProfile(session.resumeSnapshot.profile),
      resumeContext: session.resumeSnapshot.resumeContext,
      parserModel: session.resumeSnapshot.parserModel || null,
      parsedAt: session.resumeSnapshot.parsedAt,
      updatedAt: session.resumeSnapshot.updatedAt
    };
    const restoredTurns = restorePracticeTurns(session.turns);
    setPracticeSessionId(session.id);
    writeActivePracticeSessionId(session.id);
    setSelectedJob(restoredJob);
    setResume(restoredResume);
    setSessionResumeContext(restoredResume.resumeContext);
    setConfig(restoredConfig);
    setExchanges(restoredTurns.exchanges);
    setDraftAnswer("");
    setCurrentQuestion(restoredTurns.currentQuestion);
    setCurrentQuestionSequence(restoredTurns.currentQuestionSequence);
    setReport(null);
    setSessionStartedAt(parseSessionStartedAt(session.startedAt));
    setSessionElapsedSeconds(0);
    setSessionPaused(false);
    sessionPausedRef.current = false;
    sessionPauseStartedAtRef.current = null;
    setError(null);
    const restoredPhase = resolvePracticeRestorePhase(
      session.status,
      restoredTurns.exchanges.length,
      restoredConfig.questionCount
    );
    if (restoredPhase === "complete") {
      restoredQuestionContinuationRef.current = null;
      setAnswerMode("text");
      setCameraEnabled(false);
      setCameraStatus("skipped");
      setMicrophoneStatus("idle");
      setPhase("complete");
    } else if (restoredPhase === "interview") {
      restoredQuestionContinuationRef.current = restoredTurns.currentQuestion ? null : {
        sessionId: session.id,
        nextNumber: restoredTurns.exchanges.length + 1,
        exchanges: restoredTurns.exchanges
      };
      setAnswerMode("text");
      setCameraEnabled(false);
      setCameraStatus("skipped");
      setMicrophoneStatus("idle");
      setPhase("interview");
    } else {
      restoredQuestionContinuationRef.current = null;
      setAnswerMode("voice");
      setMicrophoneStatus("idle");
      setCameraStatus(cameraEnabled ? "idle" : "skipped");
      setSpeakerStatus(autoSpeak ? "idle" : "skipped");
      setPhase("prepare");
    }
  }
  async function handleResumeUpload(file) {
    if (!file || resumeUploading) return;
    setResumeUploading(true);
    setError(null);
    try {
      if (uploadResumeFile) {
        const uploaded = await uploadResumeFile(file);
        setResume(uploaded);
        onResumeChanged?.(uploaded);
      } else {
        const result = await parseResumeFile(file);
        setParsedResume({
          result,
          fileName: file.name,
          fileMime: file.type || "application/octet-stream"
        });
      }
    } catch (reason) {
      setError(errorMessage(reason, "简历解析失败，请重试"));
    } finally {
      setResumeUploading(false);
    }
  }
  async function confirmResumePreview() {
    if (!parsedResume || resumeConfirming) return;
    setResumeConfirming(true);
    setError(null);
    try {
      const confirmed = await confirmResumeFile({
        fileName: parsedResume.fileName,
        fileMime: parsedResume.fileMime,
        profile: parsedResume.result.document.profile,
        parserModel: parsedResume.result.parserModel || null
      });
      setResume(confirmed);
      onResumeChanged?.(confirmed);
      setParsedResume(null);
    } catch (reason) {
      setError(errorMessage(reason, "保存简历解析结果失败，请重试"));
    } finally {
      setResumeConfirming(false);
    }
  }
  function updateResumePreview(profile) {
    setParsedResume((current) => current ? {
      ...current,
      result: {
        ...current.result,
        document: { ...current.result.document, profile: normalizeResumeProfile(profile) }
      }
    } : current);
  }
  async function loadMoreCatalogJobs() {
    const cursor = jobsNextCursor;
    if (!cursor || jobsLoadMoreLockRef.current) return;
    const queryGeneration = jobsQueryGenerationRef.current;
    jobsLoadMoreLockRef.current = true;
    setJobsLoadingMore(true);
    setJobsError(null);
    try {
      const result = await loadJobs({
        q: catalogSearch || void 0,
        source: catalogSource,
        employmentType: employmentFilter || void 0,
        education: educationFilter || void 0,
        experienceYears: experienceFilter ? Number(experienceFilter) : void 0,
        salaryBand: salaryFilter || void 0,
        sort: catalogSort,
        limit: 24,
        cursor
      });
      if (queryGeneration !== jobsQueryGenerationRef.current) return;
      setJobs((current) => {
        const existingIds = new Set(current.map((job) => job.id));
        const merged = [...current, ...result.items.filter((job) => !existingIds.has(job.id))];
        return catalogSort === "title" ? sortPracticeJobsByTitle(merged) : merged;
      });
      setJobsNextCursor(result.nextCursor);
    } catch (reason) {
      setJobsError(errorMessage(reason, "加载更多岗位失败，请稍后重试"));
    } finally {
      jobsLoadMoreLockRef.current = false;
      setJobsLoadingMore(false);
    }
  }
  async function handleMatchSubmit(queryInput = matchDraft, uploadedJob, visibleQueryInput, command) {
    const attachment = pendingJdFile;
    const query = queryInput.trim();
    if (!canSendPracticeDiscoveryTurn(query, Boolean(attachment), matchLoading)) return;
    const effectiveQuery = query || "请根据附件中的 JD 推荐匹配岗位";
    const visibleQuery = visibleQueryInput?.trim() || effectiveQuery;
    const requestGeneration = beginPracticeAsyncRequest(discoveryGenerationRef);
    const effectiveUploadedJob = resolvePracticeDiscoveryUploadedJob(discoveryUploadedJob, uploadedJob);
    if (uploadedJob) setDiscoveryUploadedJob(uploadedJob);
    const nextMessages = [
      ...matchMessages,
      {
        role: "user",
        text: visibleQuery,
        modelText: visibleQuery === effectiveQuery ? void 0 : effectiveQuery,
        attachmentName: attachment?.name
      }
    ];
    const modelMessages = nextMessages.filter((message) => message.kind !== "error").map(({ role, text: text2, modelText }) => ({ role, text: modelText || text2 }));
    setMatchDraft("");
    setPendingJdFile(null);
    setMatchLoading(true);
    setJobsError(null);
    setMatchMessages(nextMessages);
    try {
      const discovery = await discoverJobs({
        messages: modelMessages,
        uploadedJob: effectiveUploadedJob,
        attachment,
        discoverySessionId: discoverySessionId || void 0,
        command
      });
      if (!isPracticeAsyncRequestCurrent(discoveryGenerationRef, requestGeneration)) return;
      if ("state" in discovery) {
        setDiscoverySessionId(discovery.discoverySessionId);
        if (command === "confirm_uploaded_job") {
          setDiscoveryUploadedJob(null);
          setDiscoveryJobDraft(null);
          setDiscoveryJobDraftOpen(false);
          setDiscoveryJobDraftError(null);
        }
        if (discovery.state === "job_draft") {
          const parsedDraft = {
            result: {
              kind: "jd",
              document: discovery.uploadedJob,
              parserModel: discovery.parserModel
            },
            fileName: discovery.attachmentName || attachment?.name || "上传的 JD"
          };
          setRecommendations([]);
          setRecommendationSearchId("");
          setDiscoveryUploadedJob(discovery.uploadedJob);
          setDiscoveryJobDraft(parsedDraft);
          setDiscoveryJobDraftError(null);
          setDiscoveryJobDraftOpen(true);
          setMatchMessages([...nextMessages, { role: "assistant", text: discovery.assistantMessage }]);
          return;
        }
        if (discovery.state === "needs_clarification") {
          setRecommendations([]);
          setRecommendationSearchId("");
          setMatchMessages([...nextMessages, { role: "assistant", text: discovery.assistantMessage }]);
          return;
        }
        setRecommendations(discovery.items);
        setRecommendationSearchId(discovery.searchId);
        setMatchMessages([...nextMessages, { role: "assistant", text: discovery.assistantMessage }]);
        return;
      }
      if (discovery.action === "ask") {
        setRecommendations([]);
        setRecommendationSearchId("");
        setMatchMessages([...nextMessages, { role: "assistant", text: discovery.reply }]);
        return;
      }
      const matches = await matchJobs({
        ...discovery.criteria,
        query: discovery.criteria.query || effectiveQuery,
        limit: 6
      });
      if (!isPracticeAsyncRequestCurrent(discoveryGenerationRef, requestGeneration)) return;
      setRecommendations(matches);
      setRecommendationSearchId("");
      setMatchMessages([
        ...nextMessages,
        {
          role: "assistant",
          text: matches.length > 0 ? `${discovery.reply}
已从岗位库中找到 ${matches.length} 个较匹配的岗位。你可以查看推荐理由，再确认本次演练岗位。` : `${discovery.reply}
暂时没有找到足够匹配的岗位。可以补充方向、经验年限、城市或具体 JD 后再试一次。`
        }
      ]);
    } catch (reason) {
      if (!isPracticeAsyncRequestCurrent(discoveryGenerationRef, requestGeneration)) return;
      const message = errorMessage(reason, "智能匹配岗位失败，请稍后重试");
      setJobsError(null);
      setMatchMessages([...nextMessages, { role: "assistant", text: message, kind: "error" }]);
    } finally {
      if (isPracticeAsyncRequestCurrent(discoveryGenerationRef, requestGeneration)) {
        setMatchLoading(false);
      }
    }
  }
  function closeDiscoveryConversation() {
    invalidatePracticeAsyncRequests(discoveryGenerationRef);
    setMatchLoading(false);
    setMatchMessages([]);
    setRecommendations([]);
    setRecommendationSearchId("");
    setDiscoverySessionId("");
    setDiscoveryUploadedJob(null);
    setDiscoveryJobDraft(null);
    setDiscoveryJobDraftOpen(false);
    setDiscoveryJobDraftSaving(false);
    setDiscoveryJobDraftError(null);
    setMatchDraft("");
    setPendingJdFile(null);
    setJobsError(null);
  }
  function handleJdUpload(file) {
    if (!file) return;
    setJobsError(null);
    if (file.size <= 0) {
      setJobsError("JD 附件为空，请重新选择文件");
      return;
    }
    if (file.size > MAX_JD_ATTACHMENT_BYTES) {
      setJobsError("JD 附件不能超过 10MB");
      return;
    }
    setPendingJdFile(file);
  }
  function updateDiscoveryJobDraft(document2) {
    setDiscoveryUploadedJob(document2);
    setDiscoveryJobDraft((current) => current ? {
      ...current,
      result: {
        ...current.result,
        document: document2
      }
    } : current);
    setDiscoveryJobDraftError(null);
  }
  function findSimilarFromDiscoveryJobDraft() {
    const document2 = discoveryJobDraft?.result.document;
    if (!document2 || matchLoading || discoveryJobDraftSaving) return;
    setDiscoveryJobDraftOpen(false);
    setDiscoveryJobDraftError(null);
    void handleMatchSubmit(
      "confirm_uploaded_job",
      document2,
      "请在岗位库中查找相似岗位",
      "confirm_uploaded_job"
    );
  }
  async function useDiscoveryJobDraft() {
    const document2 = discoveryJobDraft?.result.document;
    if (!document2 || discoveryJobDraftSaving) return;
    setDiscoveryJobDraftSaving(true);
    setDiscoveryJobDraftError(null);
    try {
      const createdJob = await createJob(parsedJdToCreateInput(document2));
      setJobs((current) => sortPracticeJobsByTitle([
        createdJob,
        ...current.filter((job) => job.id !== createdJob.id)
      ]));
      setCatalogSource("custom");
      setDiscoverySessionId("");
      setDiscoveryUploadedJob(null);
      setDiscoveryJobDraft(null);
      setDiscoveryJobDraftOpen(false);
      setJobPreviewRecommendationSearchId("");
      setJobPreviewLoading(false);
      setJobPreview(createdJob);
    } catch (reason) {
      setDiscoveryJobDraftError(errorMessage(reason, "创建自定义岗位失败，请核对 JD 后重试"));
    } finally {
      setDiscoveryJobDraftSaving(false);
    }
  }
  function openCreateCustomJob() {
    setCustomJobError(null);
    setCustomJobForm({ mode: "create", job: null });
  }
  function openEditCustomJob(job) {
    setCustomJobError(null);
    setCustomJobForm({ mode: "edit", job });
  }
  async function submitCustomJob(input) {
    if (!customJobForm || customJobSaving) return;
    const { mode: mode2, job } = customJobForm;
    setCustomJobSaving(true);
    setCustomJobError(null);
    try {
      if (mode2 === "edit" && job) {
        const updated = await updateJob(job.id, input);
        setJobs((current) => sortPracticeJobsByTitle(
          current.map((existing) => existing.id === updated.id ? updated : existing)
        ));
        setJobPreview((current) => current?.id === updated.id ? updated : current);
        setSelectedJob((current) => current?.id === updated.id ? updated : current);
      } else {
        const created = await createJob(input);
        setJobs((current) => sortPracticeJobsByTitle([
          created,
          ...current.filter((existing) => existing.id !== created.id)
        ]));
        setCatalogSource("custom");
        setJobPreviewLoading(false);
        setJobPreview(created);
      }
      setCustomJobForm(null);
    } catch (reason) {
      setCustomJobError(errorMessage(
        reason,
        mode2 === "edit" ? "更新自定义岗位失败，请稍后重试" : "创建自定义岗位失败，请核对 JD 后重试"
      ));
    } finally {
      setCustomJobSaving(false);
    }
  }
  function requestDeleteCustomJob(job) {
    setDeleteJobError(null);
    setDeleteJobTarget(job);
  }
  async function confirmDeleteCustomJob() {
    if (!deleteJobTarget || customJobDeleting) return;
    const jobId = deleteJobTarget.id;
    setCustomJobDeleting(true);
    setDeleteJobError(null);
    try {
      await deleteJob(jobId);
      setJobs((current) => current.filter((job) => job.id !== jobId));
      setJobPreview((current) => current?.id === jobId ? null : current);
      setSelectedJob((current) => current?.id === jobId ? null : current);
      setDeleteJobTarget(null);
    } catch (reason) {
      setDeleteJobError(errorMessage(reason, "删除自定义岗位失败，请稍后重试"));
    } finally {
      setCustomJobDeleting(false);
    }
  }
  async function openJobPreview(job, sourceSearchId = "") {
    if (sourceSearchId) {
      void recordJobClick({ searchId: sourceSearchId, jobId: job.id }).catch(() => {
      });
    }
    const requestGeneration = beginPracticeAsyncRequest(jobPreviewGenerationRef);
    setJobPreviewRecommendationSearchId(sourceSearchId);
    setJobPreview(job);
    setJobPreviewLoading(true);
    setJobsError(null);
    try {
      const detail = await loadJob(job.id);
      if (!isPracticeAsyncRequestCurrent(jobPreviewGenerationRef, requestGeneration)) return;
      setJobPreview(detail);
    } catch (reason) {
      if (!isPracticeAsyncRequestCurrent(jobPreviewGenerationRef, requestGeneration)) return;
      setJobsError(errorMessage(reason, "加载岗位详情失败，已显示岗位摘要"));
    } finally {
      if (isPracticeAsyncRequestCurrent(jobPreviewGenerationRef, requestGeneration)) {
        setJobPreviewLoading(false);
      }
    }
  }
  function openRecommendedJobPreview(job) {
    void openJobPreview(job, recommendationSearchId);
  }
  function closeJobPreview() {
    invalidatePracticeAsyncRequests(jobPreviewGenerationRef);
    setJobPreviewLoading(false);
    setJobPreviewRecommendationSearchId("");
    setJobPreview(null);
  }
  function confirmJob(job) {
    invalidatePracticeAsyncRequests(jobPreviewGenerationRef);
    setJobPreviewLoading(false);
    if (practiceSessionId) {
      setJobPreviewRecommendationSearchId("");
      setJobPreview(null);
      setError("已有一场保留的面试。请先继续该面试，或结束并保存旧记录后再选择新岗位。");
      setPreservedSessionAvailable(true);
      setPhase("setup");
      return;
    }
    if (jobPreviewRecommendationSearchId) {
      void recordJobSelection({ searchId: jobPreviewRecommendationSearchId, jobId: job.id }).catch(() => {
      });
    }
    setDiscoverySessionId("");
    setSelectedJob(job);
    setConfig((current) => ({
      ...current,
      targetRole: job.title,
      jobDescription: formatPracticeJobContext(job)
    }));
    setJobPreviewRecommendationSearchId("");
    setJobPreview(null);
    setError(null);
    setAnswerMode("voice");
    setMicrophoneStatus("idle");
    setMicrophoneLevel(null);
    setCameraStatus(cameraEnabled ? "idle" : "skipped");
    setSpeakerStatus(autoSpeak ? "idle" : "skipped");
    setPhase("prepare");
  }
  async function checkPreparationDevices() {
    if (deviceChecking) return;
    setDeviceChecking(true);
    setError(null);
    setMicrophoneLevel(null);
    setSpeakerStatus(autoSpeak ? "checking" : "skipped");
    stopPreparationDevices();
    const runId = ++preparationRunRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneStatus(answerMode === "text" ? "skipped" : "unavailable");
      setCameraStatus(cameraEnabled ? "unavailable" : "skipped");
      if (answerMode === "voice" || cameraEnabled) {
        setError("当前系统不支持媒体设备检测；可以关闭摄像头并改用文字回答");
      }
      if (autoSpeak) {
        const speakerReady = await previewCloudSpeech(
          "你好，我是本场 AI 面试官。声音输出检测正常。"
        );
        if (runId === preparationRunRef.current) setSpeakerStatus(speakerReady ? "granted" : "unavailable");
      }
      if (runId === preparationRunRef.current) setDeviceChecking(false);
      return;
    }
    if (answerMode === "text") {
      setMicrophoneStatus("skipped");
    } else {
      setMicrophoneStatus("checking");
      try {
        const microphone = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        });
        if (runId !== preparationRunRef.current) {
          stopMediaStream(microphone);
          return;
        }
        preparationMicrophoneRef.current = microphone;
        const level = await sampleMicrophoneLevel(microphone).catch(() => 0);
        if (runId !== preparationRunRef.current) {
          stopMediaStream(microphone);
          if (preparationMicrophoneRef.current === microphone) {
            preparationMicrophoneRef.current = null;
          }
          return;
        }
        setMicrophoneLevel(level);
        stopMediaStream(microphone);
        preparationMicrophoneRef.current = null;
        setMicrophoneStatus("granted");
      } catch {
        if (runId === preparationRunRef.current) setMicrophoneStatus("denied");
      }
    }
    if (runId !== preparationRunRef.current) return;
    if (!cameraEnabled) {
      setCameraStatus("skipped");
    } else {
      setCameraStatus("checking");
      try {
        const camera = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        });
        if (runId !== preparationRunRef.current) {
          stopMediaStream(camera);
          return;
        }
        preparationCameraRef.current = camera;
        observeCameraStream(camera);
        setCameraStatus("granted");
      } catch {
        if (runId === preparationRunRef.current) setCameraStatus("denied");
      }
    }
    if (runId !== preparationRunRef.current) return;
    if (autoSpeak) {
      const speakerReady = await previewCloudSpeech(
        "你好，我是本场 AI 面试官。声音输出检测正常。"
      );
      if (runId !== preparationRunRef.current) return;
      setSpeakerStatus(speakerReady ? "granted" : "unavailable");
      if (!speakerReady) setError("声音输出检测失败；请检查系统输出设备，或点击扬声器卡片关闭语音播报。");
    } else {
      setSpeakerStatus("skipped");
    }
    setDeviceChecking(false);
  }
  function togglePreparationCamera(enabled2) {
    preparationRunRef.current += 1;
    setDeviceChecking(false);
    if (microphoneStatus === "checking") setMicrophoneStatus("idle");
    setCameraEnabled(enabled2);
    if (enabled2) {
      setCameraStatus("idle");
      return;
    }
    stopMediaStream(preparationCameraRef.current);
    preparationCameraRef.current = null;
    if (preparationVideoRef.current) preparationVideoRef.current.srcObject = null;
    setCameraStatus("skipped");
  }
  function changeAnswerMode(mode2) {
    preparationRunRef.current += 1;
    setDeviceChecking(false);
    stopMediaStream(preparationMicrophoneRef.current);
    preparationMicrophoneRef.current = null;
    setAnswerMode(mode2);
    setMicrophoneStatus(mode2 === "text" ? "skipped" : "idle");
    setMicrophoneLevel(null);
    setError(null);
  }
  function togglePreparationSpeaker(enabled2) {
    preparationRunRef.current += 1;
    setDeviceChecking(false);
    cancelQuestionAudio();
    autoSpeakRef.current = enabled2;
    if (!enabled2) autoQuestionSpeechGateRef.current.reset();
    setAutoSpeak(enabled2);
    setSpeakerStatus(enabled2 ? "idle" : "skipped");
    setError(null);
  }
  function leavePreparation() {
    stopPreparationDevices();
    setDeviceChecking(false);
    setAnswerMode("voice");
    setMicrophoneStatus("idle");
    setMicrophoneLevel(null);
    setCameraStatus(cameraEnabled ? "idle" : "skipped");
    setSpeakerStatus(autoSpeak ? "idle" : "skipped");
    setError(null);
    setPracticeSessionId(null);
    setSessionResumeContext("");
    clearActivePracticeSessionId();
    setPhase("setup");
  }
  async function beginPreparedInterview() {
    if (interviewStartLockRef.current) return;
    const resumeId = resume?.id.trim() ?? "";
    const jobId = selectedJob?.id.trim() ?? "";
    if (!canBeginPracticeInterview(devicesReady, resumeId, jobId)) {
      setError("请先完成设备检测，或选择文字回答并确认摄像头状态");
      return;
    }
    if (!acquirePracticeStartLock(interviewStartLockRef)) return;
    setInterviewStarting(true);
    setPreservedSessionAvailable(false);
    setQuestionLoading(true);
    setAgentStepStage("thinking");
    setError(null);
    try {
      if (!await revalidatePreparationDevices()) return;
      const started = await ensureStartedPracticeSession(practiceSessionId, {
        jobId,
        resumeId,
        config: practiceConfigToSessionSnapshot(config)
      }, {
        create: createPracticeSession,
        start: startPracticeSession,
        onCreated: (created) => {
          setPracticeSessionId(created.id);
          writeActivePracticeSessionId(created.id);
        }
      });
      const sessionId2 = started.id;
      setPracticeSessionId(sessionId2);
      writeActivePracticeSessionId(sessionId2);
      stopMediaStream(preparationMicrophoneRef.current);
      preparationMicrophoneRef.current = null;
      setSessionResumeContext(started.resumeSnapshot.resumeContext || resume?.resumeContext || "");
      setExchanges([]);
      setDraftAnswer("");
      setReport(null);
      setSessionStartedAt(parseSessionStartedAt(started.startedAt));
      setSessionElapsedSeconds(0);
      setSessionPaused(false);
      sessionPauseStartedAtRef.current = null;
      setPhase("interview");
      await loadQuestion(1, sessionId2);
    } catch (reason) {
      setError(errorMessage(reason, "创建演练会话失败，请检查网络后重试"));
    } finally {
      interviewStartLockRef.current = false;
      setInterviewStarting(false);
      setQuestionLoading(false);
    }
  }
  async function toggleInterviewCamera() {
    const runId = ++preparationRunRef.current;
    const nextEnabled = !cameraEnabled;
    if (!nextEnabled) {
      stopMediaStream(preparationCameraRef.current);
      preparationCameraRef.current = null;
      if (interviewVideoRef.current) interviewVideoRef.current.srcObject = null;
      setCameraEnabled(false);
      return;
    }
    try {
      let stream = preparationCameraRef.current;
      if (!stream || stream.getVideoTracks().every((track) => track.readyState === "ended")) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        });
        if (runId !== preparationRunRef.current) {
          stopMediaStream(stream);
          return;
        }
        preparationCameraRef.current = stream;
        observeCameraStream(stream);
      }
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
      setCameraStatus("granted");
      setCameraEnabled(true);
    } catch {
      if (runId !== preparationRunRef.current) return;
      setCameraStatus("denied");
      setError("无法开启摄像头，请检查系统权限；也可以关闭摄像头后继续语音或文字面试。");
    }
  }
  function toggleSessionPause() {
    if (!sessionPaused) {
      sessionPauseStartedAtRef.current = Date.now();
      sessionPausedRef.current = true;
      autoQuestionSpeechGateRef.current.reset();
      cancelQuestionAudio();
      if (recording) void toggleRecording();
    } else {
      const pausedAt = sessionPauseStartedAtRef.current;
      if (pausedAt !== null) {
        setSessionStartedAt((startedAt) => startedAt === null ? null : startedAt + (Date.now() - pausedAt));
      }
      sessionPauseStartedAtRef.current = null;
      sessionPausedRef.current = false;
    }
    setSessionPaused((current) => !current);
  }
  function stopPreparationDevices() {
    preparationRunRef.current += 1;
    stopMediaStream(preparationMicrophoneRef.current);
    stopMediaStream(preparationCameraRef.current);
    preparationMicrophoneRef.current = null;
    preparationCameraRef.current = null;
    if (preparationVideoRef.current) preparationVideoRef.current.srcObject = null;
    if (interviewVideoRef.current) interviewVideoRef.current.srcObject = null;
  }
  function observeCameraStream(stream) {
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        if (preparationCameraRef.current !== stream) return;
        preparationCameraRef.current = null;
        if (preparationVideoRef.current) preparationVideoRef.current.srcObject = null;
        if (interviewVideoRef.current) interviewVideoRef.current.srcObject = null;
        setCameraStatus("unavailable");
        setError("摄像头已断开；可以重新连接设备，或关闭摄像头继续。");
      }, { once: true });
    }
  }
  async function revalidatePreparationDevices() {
    if (!navigator.mediaDevices?.getUserMedia) return answerMode === "text" && !cameraEnabled;
    const runId = preparationRunRef.current;
    if (answerMode === "voice") {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        });
        stopMediaStream(probe);
        if (runId !== preparationRunRef.current) return false;
        setMicrophoneStatus("granted");
      } catch {
        if (runId !== preparationRunRef.current) return false;
        setMicrophoneStatus("denied");
        setError("麦克风权限已经失效，请重新授权或改用文字回答。");
        return false;
      }
    }
    if (cameraEnabled) {
      const current = preparationCameraRef.current;
      if (!current || current.getVideoTracks().every((track) => track.readyState === "ended")) {
        try {
          const camera = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
          });
          if (runId !== preparationRunRef.current) {
            stopMediaStream(camera);
            return false;
          }
          preparationCameraRef.current = camera;
          observeCameraStream(camera);
          setCameraStatus("granted");
        } catch {
          if (runId !== preparationRunRef.current) return false;
          setCameraStatus("denied");
          setError("摄像头权限已经失效；请重新授权，或关闭摄像头继续。");
          return false;
        }
      }
    }
    return true;
  }
  async function loadQuestion(nextNumber, targetSessionId = practiceSessionId, completedItems = exchanges) {
    if (!targetSessionId) {
      setError("当前演练会话尚未创建，请返回准备页重新开始");
      return;
    }
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setQuestionLoading(true);
    setAgentStepStage("thinking");
    setCurrentQuestion("");
    setCurrentQuestionSequence(null);
    setError(null);
    let streamed = "";
    try {
      const step = await streamPracticeSessionAgentStep(targetSessionId, {
        signal: controller.signal,
        onDelta: (delta) => {
          streamed += delta;
          setCurrentQuestion(streamed);
        },
        onReset: () => {
          streamed = "";
          setCurrentQuestion("");
          setCurrentQuestionSequence(null);
        },
        onStatus: setAgentStepStage
      });
      if (step.type === "finished") {
        setCurrentQuestion(step.closingMessage);
        setCurrentQuestionSequence(null);
        await finishInterview(completedItems, true, true, step.closingMessage);
        return;
      }
      const turn = step.turn;
      const question = turn.question;
      if (!controller.signal.aborted) {
        maybeAutoPlayQuestionAudio(question, turn.sequence, targetSessionId);
        setCurrentQuestion(question);
        setCurrentQuestionSequence(turn.sequence);
        window.setTimeout(() => answerRef.current?.focus(), 0);
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        const restored = await getPracticeSession(targetSessionId).catch(() => null);
        const existing = restored?.turns.find((turn) => turn.sequence === nextNumber && turn.status === "open");
        if (existing) {
          maybeAutoPlayQuestionAudio(existing.question, existing.sequence, targetSessionId);
          setCurrentQuestion(existing.question);
          setCurrentQuestionSequence(existing.sequence);
          window.setTimeout(() => answerRef.current?.focus(), 0);
        } else if (restored?.status === "finished" && restored.agentEndReason) {
          await finishInterview(completedItems, true, true);
        } else {
          setError(errorMessage(reason, "生成面试问题失败，请重试"));
        }
      }
    } finally {
      if (!controller.signal.aborted) setQuestionLoading(false);
    }
  }
  async function submitAnswer() {
    const answer = draftAnswer.trim();
    if (!answer || !currentQuestion || currentQuestionSequence === null || questionLoading || turnSaving || voiceConnecting || recording) return;
    if (!practiceSessionId) {
      setError("当前演练会话已失效，请返回准备页重新开始");
      return;
    }
    cancelQuestionAudio();
    const lifecycle2 = pageLifecycleRef.current;
    setTurnSaving(true);
    setError(null);
    try {
      await finalizePracticeSessionTurn(
        practiceSessionId,
        currentQuestionSequence,
        answer,
        answerMode === "voice" ? "asr" : "text"
      );
      if (lifecycle2 !== pageLifecycleRef.current) return;
      const nextExchanges = [...exchanges, { question: currentQuestion, answer }];
      setTurnSaving(false);
      setExchanges(nextExchanges);
      setDraftAnswer("");
      await loadQuestion(currentQuestionSequence + 1, practiceSessionId, nextExchanges);
    } catch (reason) {
      if (lifecycle2 !== pageLifecycleRef.current) return;
      setDraftAnswer(answer);
      setError(errorMessage(reason, "保存本轮回答失败，请检查网络后重试"));
    } finally {
      if (lifecycle2 === pageLifecycleRef.current) setTurnSaving(false);
    }
  }
  function leaveInterviewKeepingSession() {
    if (!practiceSessionId) {
      resetPractice(false);
      return;
    }
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    cancelQuestionAudio();
    cancelPcmCaptureStartup();
    voiceRunRef.current += 1;
    stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, microphoneStreamRef.current);
    asrStreamRef.current = null;
    pcmCaptureRef.current = null;
    microphoneStreamRef.current = null;
    setRecording(false);
    setVoiceConnecting(false);
    stopPreparationDevices();
    setCameraEnabled(false);
    setCameraStatus("skipped");
    setAnswerMode("text");
    setSessionPaused(false);
    sessionPausedRef.current = false;
    autoQuestionSpeechGateRef.current.reset();
    sessionPauseStartedAtRef.current = null;
    setQuestionLoading(false);
    setTurnSaving(false);
    setError(null);
    setMatchMessages([]);
    setRecommendations([]);
    setRecommendationSearchId("");
    setDiscoverySessionId("");
    setDiscoveryUploadedJob(null);
    setMatchDraft("");
    setPreservedSessionAvailable(true);
    setPhase("setup");
  }
  async function resumePreservedInterview() {
    if (!practiceSessionId || sessionRestoring) return;
    const controller = new AbortController();
    let restoreTimedOut = false;
    const timeout = window.setTimeout(() => {
      restoreTimedOut = true;
      controller.abort(new DOMException("Practice session restore timed out", "TimeoutError"));
    }, PRACTICE_SESSION_RESTORE_TIMEOUT_MS);
    setSessionRestoring(true);
    setError(null);
    try {
      const session = await getPracticeSession(practiceSessionId, void 0, controller.signal);
      await restorePracticeSession(session);
      setPreservedSessionAvailable(false);
    } catch (reason) {
      setPreservedSessionAvailable(true);
      setError(restoreTimedOut ? "恢复保留的面试超时，请检查网络后重试。" : errorMessage(reason, "恢复保留的面试失败，请检查网络后重试"));
    } finally {
      window.clearTimeout(timeout);
      setSessionRestoring(false);
    }
  }
  async function endPreservedInterview() {
    const sessionId2 = practiceSessionId;
    if (!sessionId2 || reportLoading) return;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    setReportLoading(true);
    setError(null);
    try {
      await abandonPracticeSession(sessionId2, "none");
      resetPractice(true);
      onOpenPracticeHistory?.(sessionId2);
    } catch (reason) {
      setError(errorMessage(reason, "结束已保留的面试失败，请检查网络后重试"));
    } finally {
      setReportLoading(false);
    }
  }
  async function finishInterview(items = exchanges, currentTurnFinalized = false, serverAlreadyFinished = false, closingMessage) {
    if (items.length === 0) {
      setError("至少完成一题后才能结束本场演练");
      return false;
    }
    if (!currentTurnFinalized && currentQuestion) {
      setError("请先提交当前问题的回答，再结束本场演练");
      return false;
    }
    if (!practiceSessionId) {
      setError("当前演练会话已失效，请重新开始");
      return false;
    }
    if (!serverAlreadyFinished) {
      try {
        await finishPracticeSession(practiceSessionId, "none");
      } catch (reason) {
        setError(errorMessage(reason, "结束本场面试失败，请检查网络后重试"));
        return false;
      }
    }
    cancelQuestionAudio();
    cancelPcmCaptureStartup();
    voiceRunRef.current += 1;
    stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, microphoneStreamRef.current);
    asrStreamRef.current = null;
    pcmCaptureRef.current = null;
    microphoneStreamRef.current = null;
    setRecording(false);
    setVoiceConnecting(false);
    stopMediaStream(preparationCameraRef.current);
    preparationCameraRef.current = null;
    setCurrentQuestion("");
    setCurrentQuestionSequence(null);
    setError(null);
    setPreservedSessionAvailable(false);
    setPhase("complete");
    if (closingMessage && autoSpeak) {
      const finishedSessionId = practiceSessionId;
      startManagedSpeech(closingMessage, (signal) => requestPracticeClosingSpeech(
        finishedSessionId,
        practiceSpeechPreset(config.interviewer),
        void 0,
        { signal }
      ), "closing");
    }
    return true;
  }
  async function abandonInterview() {
    if (!practiceSessionId) {
      setError("当前演练会话已失效，请重新开始");
      return;
    }
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    setReportLoading(true);
    setError(null);
    try {
      await abandonPracticeSession(practiceSessionId, "none");
    } catch (reason) {
      setError(errorMessage(reason, "结束本场面试失败，请检查网络后重试"));
      return;
    } finally {
      setReportLoading(false);
    }
    cancelQuestionAudio();
    cancelPcmCaptureStartup();
    voiceRunRef.current += 1;
    stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, microphoneStreamRef.current);
    asrStreamRef.current = null;
    pcmCaptureRef.current = null;
    microphoneStreamRef.current = null;
    setRecording(false);
    setVoiceConnecting(false);
    stopPreparationDevices();
    setCurrentQuestion("");
    setCurrentQuestionSequence(null);
    setDraftAnswer("");
    setPreservedSessionAvailable(false);
    if (exchanges.length > 0) {
      setPhase("complete");
    } else {
      resetPractice(true);
    }
  }
  async function generateReport(items = exchanges) {
    if (items.length === 0) {
      setError("至少完成一题后才能生成复盘");
      return;
    }
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setReportLoading(true);
    setCurrentQuestion("");
    setCurrentQuestionSequence(null);
    setError(null);
    try {
      if (!practiceSessionId) throw new Error("当前演练会话已失效，请重新开始");
      const sessionId2 = practiceSessionId;
      const result = await persistPracticeReportChoice(sessionId2, "generate", {
        finish: finishPracticeSession,
        requestReport: requestPracticeSessionReport
      });
      if (!result) throw new Error("复盘请求未启动");
      if (controller.signal.aborted) return;
      if (onOpenPracticeHistory) {
        clearActivePracticeSessionId();
        setPracticeSessionId(null);
        onOpenPracticeHistory(sessionId2);
        return;
      }
      const nextReport = result.state === "ready" ? result.report.content : await pollPracticeSessionReport(sessionId2, controller.signal);
      if (!controller.signal.aborted && nextReport) {
        setReport(nextReport);
        clearActivePracticeSessionId();
        setPhase("report");
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorMessage(reason, "生成复盘失败，请重试"));
    } finally {
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
      if (!controller.signal.aborted) setReportLoading(false);
    }
  }
  async function skipReport() {
    if (reportLoading) return;
    setReportLoading(true);
    setError(null);
    try {
      if (practiceSessionId) {
        await persistPracticeReportChoice(practiceSessionId, "skip", {
          finish: finishPracticeSession,
          requestReport: requestPracticeSessionReport
        });
      }
      completeSkippedPracticeFlow(resetPractice, onOpenPracticeHistory);
    } catch (reason) {
      setError(errorMessage(reason, "保存“暂不生成复盘”选择失败，请重试"));
    } finally {
      setReportLoading(false);
    }
  }
  function resetPractice(clearPersistedSession = true) {
    invalidatePracticeAsyncRequests(discoveryGenerationRef);
    invalidatePracticeAsyncRequests(jobPreviewGenerationRef);
    requestAbortRef.current?.abort();
    restoredQuestionContinuationRef.current = null;
    autoQuestionSpeechGateRef.current.reset();
    cancelQuestionAudio();
    cancelPcmCaptureStartup();
    stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, microphoneStreamRef.current);
    stopPreparationDevices();
    voiceRunRef.current += 1;
    asrStreamRef.current = null;
    pcmCaptureRef.current = null;
    microphoneStreamRef.current = null;
    setRecording(false);
    setVoiceConnecting(false);
    setDeviceChecking(false);
    setSessionStartedAt(null);
    setSessionElapsedSeconds(0);
    setSessionPaused(false);
    sessionPausedRef.current = false;
    setPracticeSessionId(null);
    setSessionResumeContext("");
    setTurnSaving(false);
    sessionPauseStartedAtRef.current = null;
    setAnswerMode("voice");
    setMicrophoneStatus("idle");
    setMicrophoneLevel(null);
    setCameraStatus(cameraEnabled ? "idle" : "skipped");
    setSpeakerStatus(autoSpeak ? "idle" : "skipped");
    setPhase("setup");
    setExchanges([]);
    setCurrentQuestion("");
    setCurrentQuestionSequence(null);
    setDraftAnswer("");
    setReport(null);
    setQuestionLoading(false);
    setReportLoading(false);
    setInterviewStarting(false);
    interviewStartLockRef.current = false;
    setPreservedSessionAvailable(false);
    setPreservedFinishConfirmOpen(false);
    setMatchLoading(false);
    setMatchMessages([]);
    setRecommendations([]);
    setRecommendationSearchId("");
    setDiscoverySessionId("");
    setDiscoveryUploadedJob(null);
    setMatchDraft("");
    setJobPreviewLoading(false);
    setJobPreviewRecommendationSearchId("");
    setJobPreview(null);
    setError(null);
    if (clearPersistedSession) clearActivePracticeSessionId();
  }
  async function toggleRecording() {
    if (recording) {
      cancelPcmCaptureStartup();
      voiceRunRef.current += 1;
      stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, microphoneStreamRef.current);
      asrStreamRef.current = null;
      pcmCaptureRef.current = null;
      microphoneStreamRef.current = null;
      setRecording(false);
      return;
    }
    if (ttsSpeaking) return;
    const activePracticeInterviewId = practiceSessionId;
    if (!activePracticeInterviewId) {
      setError("演练会话尚未就绪，请返回岗位配置后重新开始。");
      return;
    }
    setError(null);
    setVoiceConnecting(true);
    cancelQuestionAudio();
    cancelPcmCaptureStartup();
    const runId = ++voiceRunRef.current;
    const pcmStartupController = new AbortController();
    pcmStartupAbortRef.current = pcmStartupController;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (runId !== voiceRunRef.current) {
        stopMediaStream(stream);
        return;
      }
      microphoneStreamRef.current = stream;
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          if (microphoneStreamRef.current !== stream) return;
          cancelPcmCaptureStartup();
          voiceRunRef.current += 1;
          stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, stream);
          asrStreamRef.current = null;
          pcmCaptureRef.current = null;
          microphoneStreamRef.current = null;
          setRecording(false);
          setVoiceConnecting(false);
          setMicrophoneStatus("unavailable");
          setError("麦克风已断开，请重新连接设备或改用文字回答。");
        }, { once: true });
      }
      let committed = draftAnswer.trim();
      const updateTranscript = setDraftAnswer;
      const setLiveTranscript = (text2) => {
        const live = text2.trim();
        updateTranscript([committed, live].filter(Boolean).join(committed && live ? "\n" : ""));
      };
      const asr = await connectAsrStream({
        practiceInterviewId: activePracticeInterviewId,
        onPartial: setLiveTranscript,
        onFinal: (text2) => {
          const finalText = text2.trim();
          if (!finalText) return;
          committed = [committed, finalText].filter(Boolean).join(committed ? "\n" : "");
          updateTranscript(committed);
        },
        onDisconnect: (disconnectError) => {
          if (runId !== voiceRunRef.current) return;
          cancelPcmCaptureStartup();
          voiceRunRef.current += 1;
          stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, microphoneStreamRef.current);
          asrStreamRef.current = null;
          pcmCaptureRef.current = null;
          microphoneStreamRef.current = null;
          setRecording(false);
          setVoiceConnecting(false);
          setError(disconnectError.message || "实时语音识别连接已断开，请重试。");
        }
      }, { signal: pcmStartupController.signal });
      if (runId !== voiceRunRef.current) {
        stopVoiceCapture(asr, null, stream);
        return;
      }
      asrStreamRef.current = asr;
      const readyPcmCapture = await startPcmCapture(
        stream,
        (chunk) => asr.sendPcm(chunk),
        { signal: pcmStartupController.signal }
      );
      if (runId !== voiceRunRef.current) {
        stopVoiceCapture(asr, readyPcmCapture, stream);
        return;
      }
      pcmCaptureRef.current = readyPcmCapture;
      setRecording(true);
    } catch (reason) {
      if (runId !== voiceRunRef.current) return;
      stopVoiceCapture(asrStreamRef.current, pcmCaptureRef.current, microphoneStreamRef.current);
      asrStreamRef.current = null;
      pcmCaptureRef.current = null;
      microphoneStreamRef.current = null;
      setRecording(false);
      if (runId === voiceRunRef.current) {
        setError(errorMessage(reason, "无法使用麦克风，请检查系统权限"));
      }
    } finally {
      if (pcmStartupAbortRef.current === pcmStartupController) {
        pcmStartupAbortRef.current = null;
      }
      if (runId === voiceRunRef.current) setVoiceConnecting(false);
    }
  }
  if (sessionRestoring) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full min-h-[420px] items-center justify-center bg-white", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[13px] text-slate-500", role: "status", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 18 }),
      "正在恢复上次演练…"
    ] }) });
  }
  if (phase === "prepare" && resume && selectedJob) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      PracticePreparationView,
      {
        config,
        resume,
        job: selectedJob,
        cameraEnabled,
        answerMode,
        microphoneStatus,
        microphoneLevel,
        cameraStatus,
        speakerStatus,
        speakerEnabled: autoSpeak,
        checking: deviceChecking,
        starting: interviewStarting,
        ready: devicesReady,
        error: error2,
        videoRef: preparationVideoRef,
        onAnswerModeChange: changeAnswerMode,
        onCameraEnabledChange: togglePreparationCamera,
        onSpeakerEnabledChange: togglePreparationSpeaker,
        onBack: leavePreparation,
        onStart: () => void beginPreparedInterview()
      }
    );
  }
  if (phase === "interview") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      PracticeSessionView,
      {
        config,
        resume,
        exchanges,
        currentQuestion,
        draftAnswer,
        questionNumber,
        progress,
        questionLoading,
        turnSaving,
        agentStepStage,
        reportLoading,
        recording,
        voiceConnecting,
        ttsSpeaking,
        ttsPlaybackPhase,
        autoSpeak,
        cameraEnabled,
        answerMode,
        paused: sessionPaused,
        elapsedSeconds: sessionElapsedSeconds,
        error: error2,
        answerRef,
        videoRef: interviewVideoRef,
        onAnswerChange: setDraftAnswer,
        onSubmit: () => void submitAnswer(),
        onRetryQuestion: () => void loadQuestion(exchanges.length + 1),
        onFinish: () => void abandonInterview(),
        onToggleRecording: () => void toggleRecording(),
        onToggleSpeak: (value) => {
          autoSpeakRef.current = value;
          if (!value) {
            autoQuestionSpeechGateRef.current.reset();
            cancelQuestionAudio();
          }
          setAutoSpeak(value);
        },
        onToggleCamera: () => void toggleInterviewCamera(),
        onTogglePause: toggleSessionPause,
        onSpeak: () => {
          if (!recording && !voiceConnecting && !ttsSpeaking && currentQuestionSequence !== null && practiceSessionId) {
            playQuestionAudio(currentQuestion, currentQuestionSequence, practiceSessionId);
          }
        },
        onExit: leaveInterviewKeepingSession
      }
    );
  }
  if (phase === "complete") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      PracticeCompletionView,
      {
        config,
        exchanges,
        loading: reportLoading,
        error: error2,
        onGenerateReport: () => void generateReport(),
        onSkipReport: () => void skipReport()
      }
    );
  }
  if (phase === "report" && report) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      PracticeReportView,
      {
        config,
        report,
        exchanges,
        onRestart: () => resetPractice(true),
        onOpenHistory: () => {
          resetPractice(true);
          onOpenPracticeHistory?.();
        }
      }
    );
  }
  if (conversationActive) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        PracticeDiscoveryView,
        {
          messages: matchMessages,
          recommendations,
          draft: matchDraft,
          loading: matchLoading,
          jobsError,
          jobDraft: discoveryJobDraft?.result.document ?? null,
          resume,
          resumeUploading,
          pendingJdFile,
          onDraftChange: setMatchDraft,
          onSubmit: (value) => void handleMatchSubmit(value),
          onClose: closeDiscoveryConversation,
          onOpenJob: openRecommendedJobPreview,
          onResumeUpload: (file) => void handleResumeUpload(file),
          onJdUpload: handleJdUpload,
          onRemoveJd: () => setPendingJdFile(null),
          onReviewJobDraft: () => setDiscoveryJobDraftOpen(true)
        }
      ),
      discoveryJobDraft && discoveryJobDraftOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
        PracticeJdPreviewDialog,
        {
          result: discoveryJobDraft.result,
          fileName: discoveryJobDraft.fileName,
          loading: discoveryJobDraftSaving,
          error: discoveryJobDraftError,
          onDocumentChange: updateDiscoveryJobDraft,
          onClose: () => {
            if (!discoveryJobDraftSaving) setDiscoveryJobDraftOpen(false);
          },
          onFindSimilar: findSimilarFromDiscoveryJobDraft,
          onUse: () => void useDiscoveryJobDraft()
        }
      ),
      jobPreview && /* @__PURE__ */ jsxRuntimeExports.jsx(
        PracticeJobDialog,
        {
          job: jobPreview,
          loading: jobPreviewLoading,
          config,
          resumeReady: Boolean(resume?.id),
          resumeName: resume?.fileName,
          onConfigChange: updateConfig,
          onClose: closeJobPreview,
          onConfirm: () => confirmJob(jobPreview)
        }
      ),
      parsedResume && /* @__PURE__ */ jsxRuntimeExports.jsx(
        PracticeResumePreviewDialog,
        {
          value: parsedResume,
          loading: resumeConfirming,
          onProfileChange: updateResumePreview,
          onClose: () => setParsedResume(null),
          onConfirm: () => void confirmResumePreview()
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-testid": "practice-home-scroll", className: "h-full min-w-0 overflow-x-hidden overflow-y-auto bg-[#fbfbfa] text-slate-950", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto min-w-0 w-full max-w-[1280px] px-[clamp(22px,4vw,54px)] pb-14", children: [
      preservedSessionAvailable && practiceSessionId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sticky top-3 z-20 mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur", role: "status", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] font-semibold text-slate-900", children: "面试会话已保留" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-0.5 truncate text-[11px] text-slate-500", children: [
            selectedJob?.title || config.targetRole,
            " · 回到面试间后可从服务端进度继续"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setPreservedFinishConfirmOpen(true), disabled: reportLoading, className: "h-9 rounded-full border border-red-200 bg-white px-4 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50", children: "结束并保存记录" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => void resumePreservedInterview(), disabled: reportLoading, className: "h-9 rounded-full bg-slate-950 px-4 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50", children: "继续面试" })
        ] })
      ] }),
      preservedFinishConfirmOpen && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-5", role: "dialog", "aria-modal": "true", "aria-labelledby": "practice-preserved-finish-title", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-[440px] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "practice-preserved-finish-title", className: "text-[18px] font-semibold text-slate-950", children: "结束这场已保留的面试？" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[12px] leading-6 text-slate-600", children: "已提交的问答会保留到面试记录；正在生成的问题和未提交回答会被放弃。结束后可以重新选择其他岗位。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex justify-end gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setPreservedFinishConfirmOpen(false), className: "h-10 rounded-xl border border-slate-200 px-4 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50", children: "取消" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
            setPreservedFinishConfirmOpen(false);
            void endPreservedInterview();
          }, className: "h-10 rounded-xl bg-red-500 px-4 text-[12px] font-semibold text-white transition hover:bg-red-600", children: "结束本场" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "flex min-h-[clamp(360px,58vh,530px)] flex-col items-center justify-center py-12 text-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeHeader, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "form",
          {
            onSubmit: (event) => {
              event.preventDefault();
              void handleMatchSubmit();
            },
            className: "mt-10 w-full max-w-[900px] rounded-[28px] border border-slate-200 bg-white px-5 pb-4 pt-4 text-left shadow-[0_24px_70px_-48px_rgba(15,23,42,0.5)] sm:px-7",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  value: matchDraft,
                  onChange: (event) => setMatchDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleMatchSubmit();
                    }
                  },
                  rows: 3,
                  maxLength: 6e3,
                  placeholder: "例如：我想练一场杭州的 Java 后端工程师面试，3 年经验，压力面…",
                  "aria-label": "描述你想面试的岗位",
                  className: "h-[88px] w-full resize-none bg-transparent text-[15px] leading-7 text-slate-900 outline-none placeholder:text-slate-400"
                }
              ),
              pendingJdFile && /* @__PURE__ */ jsxRuntimeExports.jsx(PendingJdAttachment, { file: pendingJdFile, onRemove: () => setPendingJdFile(null) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-3.5 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(m, { size: 16 }),
                    resumeUploading ? "正在解析简历…" : resume?.id ? "更换简历" : "上传简历",
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "file",
                        accept: RESUME_ACCEPT,
                        disabled: resumeUploading,
                        onChange: (event) => {
                          void handleResumeUpload(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        },
                        className: "sr-only"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { title: "支持 PDF、PNG、JPEG、TXT 和 Markdown，最大 10MB", className: "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-3.5 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(s$3, { size: 16 }),
                    pendingJdFile ? "更换 JD" : "上传 JD",
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "file",
                        accept: JD_ACCEPT,
                        disabled: matchLoading,
                        onChange: (event) => {
                          handleJdUpload(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        },
                        className: "sr-only"
                      }
                    )
                  ] }),
                  resume?.id && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onOpenResume, disabled: !onOpenResume, className: "max-w-[220px] truncate rounded-full bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700 disabled:cursor-default", children: [
                    "简历已就绪 · ",
                    resume.fileName
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "submit",
                    "aria-label": "发送岗位需求",
                    disabled: !canSendPracticeDiscoveryTurn(matchDraft, Boolean(pendingJdFile), matchLoading),
                    className: "flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400",
                    children: matchLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 18 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(s$9, { size: 18, weight: "bold" })
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 flex max-w-[880px] flex-wrap justify-center gap-2", children: HOME_PROMPTS.map((prompt) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => void handleMatchSubmit(prompt), className: "rounded-full border border-slate-200 bg-white px-4 py-2.5 text-[12px] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50", children: prompt }, prompt)) }),
        (error2 || jobsError) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 w-full max-w-[900px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(InlineError, { message: error2 || jobsError || "" }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "min-w-0 pb-10", "aria-labelledby": "practice-job-catalog-title", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 border-b border-slate-200 pb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-6", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setCatalogSource("preset"), id: "practice-job-catalog-title", className: `pb-3 text-[15px] transition ${catalogSource === "preset" ? "border-b-2 border-slate-950 font-semibold text-slate-950" : "text-slate-400 hover:text-slate-700"}`, children: "预设岗位" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setCatalogSource("custom"), className: `pb-3 text-[15px] transition ${catalogSource === "custom" ? "border-b-2 border-slate-950 font-semibold text-slate-950" : "text-slate-400 hover:text-slate-700"}`, children: "我的岗位" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: openCreateCustomJob, className: "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-slate-950 px-4 text-[12px] font-semibold text-white transition hover:bg-slate-800", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(n$2, { "aria-hidden": true, size: 15, weight: "bold" }),
                "新建岗位"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "form",
                {
                  onSubmit: (event) => {
                    event.preventDefault();
                    setCatalogSearch(catalogSearchDraft.trim());
                  },
                  className: "relative w-full max-w-[250px]",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(f, { "aria-hidden": true, size: 17, className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: catalogSearchDraft, onChange: (event) => setCatalogSearchDraft(event.target.value), placeholder: "搜索岗位 / 公司", "aria-label": "搜索岗位或公司", className: "h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-9 text-[12px] outline-none transition placeholder:text-slate-400 focus:border-slate-400" }),
                    (catalogSearchDraft.trim() !== catalogSearch || jobsLoading) && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { "aria-label": "正在搜索岗位", size: 15, className: "absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" })
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeFilterSelect, { label: "岗位类别", value: employmentFilter, options: EMPLOYMENT_TYPE_FILTERS, onChange: setEmploymentFilter, includeAll: false }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              PracticeFilterSelect,
              {
                label: "薪资",
                allLabel: "不限",
                value: salaryFilter,
                options: SALARY_FILTERS.map((item) => item.value),
                optionLabels: Object.fromEntries(SALARY_FILTERS.map((item) => [item.value, item.label])),
                onChange: (value) => setSalaryFilter(isPracticeJobSalaryBand(value) ? value : "")
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeFilterSelect, { label: "学历", value: educationFilter, options: EDUCATION_FILTERS, onChange: setEducationFilter }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeFilterSelect, { label: "经验", value: experienceFilter, options: EXPERIENCE_FILTERS.map((item) => item.value).filter(Boolean), optionLabels: Object.fromEntries(EXPERIENCE_FILTERS.map((item) => [item.value, item.label])), onChange: setExperienceFilter }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              PracticeFilterSelect,
              {
                label: "排序",
                value: catalogSort,
                options: ["title", "recent"],
                optionLabels: { title: "名称排序", recent: "最近更新" },
                onChange: (value) => setCatalogSort(value === "title" ? "title" : "recent"),
                includeAll: false
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4", children: jobsLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid min-w-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3", "aria-label": "正在加载岗位", children: [0, 1, 2, 3, 4, 5].map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-[184px] animate-pulse rounded-[20px] border border-slate-200 bg-white" }, item)) }) : jobs.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid min-w-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3", children: jobs.map((job) => /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeJobCard, { job, selected: selectedJob?.id === job.id, onClick: () => void openJobPreview(job) }, job.id)) }),
          jobsNextCursor && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 flex justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => void loadMoreCatalogJobs(),
              disabled: jobsLoadingMore,
              className: "inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60",
              children: [
                jobsLoadingMore && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 15 }),
                jobsLoadingMore ? "正在加载…" : "加载更多岗位"
              ]
            }
          ) })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-[20px] border border-dashed border-slate-200 bg-white px-5 py-12 text-center text-[13px] text-slate-500", children: catalogSource === "custom" ? "还没有自定义岗位。点击「新建岗位」手动填写 JD，即可用它进行模拟面试。" : "没有找到符合当前条件的岗位，请调整筛选条件。" }) })
      ] })
    ] }),
    jobPreview && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PracticeJobDialog,
      {
        job: jobPreview,
        loading: jobPreviewLoading,
        config,
        resumeReady: Boolean(resume?.id),
        resumeName: resume?.fileName,
        onConfigChange: updateConfig,
        onClose: closeJobPreview,
        onConfirm: () => confirmJob(jobPreview),
        onEdit: jobPreview.source === "custom" ? () => openEditCustomJob(jobPreview) : void 0,
        onDelete: jobPreview.source === "custom" ? () => requestDeleteCustomJob(jobPreview) : void 0
      }
    ),
    customJobForm && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PracticeCustomJobFormDialog,
      {
        mode: customJobForm.mode,
        initial: customJobForm.job,
        saving: customJobSaving,
        error: customJobError,
        onSubmit: submitCustomJob,
        onClose: () => {
          if (customJobSaving) return;
          setCustomJobForm(null);
          setCustomJobError(null);
        }
      }
    ),
    deleteJobTarget && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PracticeConfirmDialog,
      {
        title: "删除自定义岗位",
        message: `确定删除「${deleteJobTarget.title}」吗？此操作无法撤销，但不会影响已完成的面试记录。`,
        confirmLabel: "删除",
        confirmTone: "danger",
        busy: customJobDeleting,
        error: deleteJobError,
        onConfirm: () => void confirmDeleteCustomJob(),
        onClose: () => {
          if (customJobDeleting) return;
          setDeleteJobTarget(null);
          setDeleteJobError(null);
        }
      }
    ),
    parsedResume && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PracticeResumePreviewDialog,
      {
        value: parsedResume,
        loading: resumeConfirming,
        onProfileChange: updateResumePreview,
        onClose: () => setParsedResume(null),
        onConfirm: () => void confirmResumePreview()
      }
    )
  ] });
};
const PracticeDiscoveryView = ({
  messages,
  recommendations,
  draft,
  loading,
  jobsError,
  jobDraft,
  resume,
  resumeUploading,
  pendingJdFile,
  onDraftChange,
  onSubmit,
  onClose,
  onOpenJob,
  onResumeUpload,
  onJdUpload,
  onRemoveJd,
  onReviewJobDraft
}) => {
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const suggestions = latestAssistant && latestAssistant.kind !== "error" && recommendations.length === 0 && !jobDraft && !loading ? discoveryReplySuggestions(latestAssistant.text) : [];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full min-h-0 flex-col overflow-hidden bg-white text-slate-950", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5 sm:px-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] font-semibold", children: "岗位匹配助手" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 text-[11px] text-slate-400", children: "补充必要信息后，AI 会检索 Climb 岗位库" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, "aria-label": "关闭岗位匹配对话", className: "flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900", children: /* @__PURE__ */ jsxRuntimeExports.jsx(n, { size: 20 }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "min-h-0 flex-1 overflow-y-auto px-5 pb-32 pt-8 sm:px-8", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex w-full max-w-[900px] flex-col gap-8", children: [
      messages.map((message, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: message.role === "user" ? "flex justify-end" : "", children: message.role === "user" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-[78%] rounded-[20px] bg-slate-100 px-5 py-3 text-[14px] leading-6 text-slate-800", children: [
        message.attachmentName && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-600", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(s$3, { className: "shrink-0", size: 15 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: message.attachmentName })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "whitespace-pre-wrap", children: message.text })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-[820px]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "p",
          {
            role: message.kind === "error" ? "alert" : void 0,
            className: `whitespace-pre-wrap text-[15px] leading-7 ${message.kind === "error" ? "text-rose-700" : "text-slate-700"}`,
            children: message.text
          }
        ),
        index2 === messages.length - 1 && suggestions.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 rounded-[20px] border border-slate-200 px-5 py-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-3 text-[12px] text-slate-500", children: "你可以直接选择" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: suggestions.map((suggestion) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onSubmit(suggestion), className: "rounded-full border border-slate-200 px-4 py-2 text-[13px] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50", children: suggestion }, suggestion)) })
        ] })
      ] }) }, `${message.role}-${index2}-${message.text}`)),
      loading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[13px] text-slate-500", role: "status", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 17 }),
        "正在理解你的需求并匹配岗位…"
      ] }),
      jobDraft && recommendations.length === 0 && !loading && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "section",
        {
          "data-testid": "practice-discovery-job-draft",
          className: "rounded-[20px] border border-blue-100 bg-blue-50/60 p-5",
          "aria-labelledby": "practice-discovery-job-draft-title",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold text-blue-700", children: "已读取岗位附件" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "practice-discovery-job-draft-title", className: "mt-1 truncate text-[16px] font-semibold text-slate-950", children: jobDraft.title || "待确认岗位" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 truncate text-[11px] text-slate-500", children: [jobDraft.companyName, jobDraft.location, jobDraft.category].filter(Boolean).join(" · ") || "请核对模型提取的岗位信息" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: onReviewJobDraft,
                className: "h-10 shrink-0 rounded-xl bg-slate-950 px-4 text-[12px] font-semibold text-white transition hover:bg-slate-800",
                children: "查看并编辑 JD"
              }
            )
          ] })
        }
      ),
      recommendations.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { "aria-labelledby": "conversation-recommendations-title", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "conversation-recommendations-title", className: "text-[15px] font-medium text-slate-800", children: "找到这些匹配岗位，点击任意卡片继续配置面试。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 grid gap-3 sm:grid-cols-2", children: recommendations.map((job) => /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeJobCard, { job, selected: false, onClick: () => onOpenJob(job) }, job.id)) })
      ] }),
      jobsError && /* @__PURE__ */ jsxRuntimeExports.jsx(InlineError, { message: jobsError })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shrink-0 border-t border-slate-100 bg-white px-5 py-4 sm:px-8", children: [
      pendingJdFile && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto mb-2 w-full max-w-[920px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(PendingJdAttachment, { file: pendingJdFile, onRemove: onRemoveJd, compact: true }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "form",
        {
          onSubmit: (event) => {
            event.preventDefault();
            onSubmit(draft);
          },
          className: "mx-auto flex w-full max-w-[920px] items-end gap-2 rounded-[24px] border border-slate-200 bg-white p-2 shadow-[0_18px_60px_-44px_rgba(15,23,42,0.55)]",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { "aria-label": "上传或更换简历", className: "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900", title: "上传或更换简历", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(m, { size: 18 }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", accept: RESUME_ACCEPT, disabled: resumeUploading || loading, onChange: (event) => {
                  onResumeUpload(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }, className: "sr-only" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { "aria-label": "上传 JD", className: "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900", title: "上传 JD", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(s$3, { size: 18 }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", accept: JD_ACCEPT, disabled: loading, onChange: (event) => {
                  onJdUpload(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }, className: "sr-only" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "textarea",
              {
                value: draft,
                onChange: (event) => onDraftChange(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onSubmit(draft);
                  }
                },
                rows: 1,
                placeholder: resume?.id ? "继续补充岗位、经验、城市或薪资偏好" : "继续聊聊，也可以先上传简历",
                "aria-label": "继续岗位匹配对话",
                className: "max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[13px] leading-5 outline-none placeholder:text-slate-400"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", "aria-label": "发送", disabled: !canSendPracticeDiscoveryTurn(draft, Boolean(pendingJdFile), loading), className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 17 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(s$9, { size: 17, weight: "bold" }) })
          ]
        }
      )
    ] })
  ] });
};
const PendingJdAttachment = ({ file, onRemove, compact = false }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "div",
  {
    "data-testid": "practice-pending-jd",
    className: `flex min-w-0 items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 text-left ${compact ? "px-3 py-2" : "mb-3 px-3.5 py-3"}`,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx(s$3, { size: 18 }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-[11px] font-semibold text-slate-800", children: file.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-0.5 text-[9px] text-slate-500", children: [
          formatAttachmentBytes(file.size),
          " · 将随本轮消息发送"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onRemove,
          "aria-label": `移除 JD 附件 ${file.name}`,
          className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-800",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(n, { size: 16 })
        }
      )
    ]
  }
);
const PracticeHeader = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "text-center", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold tracking-[0.18em] text-blue-700", children: "CLIMB 演练模式" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-4 text-[clamp(28px,3.4vw,40px)] font-normal tracking-[-0.03em] text-slate-950", children: "告诉 Climb 你想面试的岗位" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[13px] text-slate-500", children: "上传简历或 JD，也可以直接描述你想演练的岗位。" })
] });
const PracticeJobCard = ({ job, selected, onClick }) => {
  const matchScore = "matchScore" in job ? job.matchScore : null;
  const matchReasons = "matchReasons" in job ? job.matchReasons : [];
  const matchGaps = "gaps" in job && Array.isArray(job.gaps) ? job.gaps : [];
  const matchConfidence = "confidence" in job ? job.confidence : void 0;
  const cardCompanyName = practiceCardCompanyName(job.companyName);
  const companyMeta = [cardCompanyName, job.location].filter(Boolean).join(" · ");
  const cardSalaryLabel = isSyntheticCardLabel(job.salaryLabel) ? "" : job.salaryLabel;
  const requirements = [job.education, formatExperience(job)].filter(Boolean);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick,
      "aria-pressed": selected,
      className: `group flex min-h-[184px] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[20px] border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_16px_45px_-36px_rgba(15,23,42,0.65)] ${selected ? "border-slate-950 ring-1 ring-slate-950" : "border-slate-200"}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 items-start justify-between gap-3 overflow-hidden", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1 overflow-hidden", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "line-clamp-2 [overflow-wrap:anywhere] text-[15px] font-semibold leading-6 text-slate-950", children: job.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 max-w-full truncate text-[12px] text-slate-500", title: cardSalaryLabel || job.category || "面议", children: cardSalaryLabel || job.category || "面议" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex shrink-0 flex-col items-end gap-1.5", children: matchScore !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { title: matchConfidence ? `推荐置信度：${matchConfidence}` : void 0, className: "rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-white", children: [
            "匹配 ",
            matchScore
          ] }) : selected ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-white", children: "已选择" }) : null })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex min-w-0 max-w-full flex-wrap gap-1.5 overflow-hidden", children: [
          requirements.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { title: item, className: "block min-w-0 max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600", children: item }, item)),
          job.tags.slice(0, 2).map((tag) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { title: tag, className: "block min-w-0 max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600", children: tag }, tag))
        ] }),
        matchReasons.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-3 line-clamp-1 text-[10px] text-emerald-700", children: [
          "匹配：",
          matchReasons.slice(0, 2).join("；")
        ] }),
        matchGaps.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 line-clamp-1 text-[10px] text-amber-700", children: [
          "待确认：",
          matchGaps.slice(0, 2).join("；")
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-auto flex w-full min-w-0 items-center gap-2 overflow-hidden border-t border-slate-100 pt-3 text-[11px] text-slate-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CompanyLogo, { companyName: cardCompanyName, logoUrl: job.companyLogoUrl }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 truncate", children: companyMeta || "公司信息未标注" })
        ] })
      ]
    }
  );
};
function practiceCardCompanyName(value) {
  return (value ?? "").replace(/\s*[（(]\s*(?:模拟岗位|模拟\s*JD)\s*[）)]\s*$/u, "").trim();
}
function isSyntheticCardLabel(value) {
  return /^(?:模拟岗位|模拟\s*JD)(?:\s*[·•|｜:\-]\s*.*)?$/u.test((value ?? "").trim());
}
const CompanyLogo = ({ companyName, logoUrl }) => {
  const [failed, setFailed] = reactExports.useState(false);
  reactExports.useEffect(() => setFailed(false), [logoUrl]);
  const trustedLogoUrl = isTrustedCompanyLogoUrl(logoUrl) ? logoUrl : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white text-slate-600", children: trustedLogoUrl && !failed ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: trustedLogoUrl,
      alt: "",
      "aria-hidden": "true",
      loading: "lazy",
      decoding: "async",
      referrerPolicy: "no-referrer",
      onError: () => setFailed(true),
      className: "h-full w-full object-contain p-1"
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx(i$3, { "aria-label": companyName ? `${companyName} 默认公司图标` : "默认公司图标", size: 15 }) });
};
const PracticeResumePreviewDialog = ({ value, loading, onProfileChange, onClose, onConfirm }) => {
  const closeButtonRef = reactExports.useRef(null);
  const profile = value.result.document.profile;
  const update = (key, next) => {
    onProfileChange({ ...profile, [key]: next });
  };
  const canConfirm = Boolean(
    profile.name || profile.summary || profile.targetRoles.length || profile.skills.length || profile.projects.length || profile.workExperience.length || profile.education.length
  ) && !loading;
  reactExports.useEffect(() => closeButtonRef.current?.focus(), []);
  reactExports.useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [loading, onClose]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6",
      onMouseDown: (event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "section",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "practice-resume-preview-title",
          className: "flex max-h-[94vh] w-full max-w-[1120px] min-w-0 flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_36px_110px_-38px_rgba(0,0,0,0.85)]",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-start justify-between gap-5 border-b border-slate-200 px-6 py-5 sm:px-7", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "practice-resume-preview-title", className: "text-[21px] font-semibold tracking-tight text-slate-950", children: "确认简历解析结果" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1.5 truncate text-[11px] text-slate-500", children: [
                  value.fileName,
                  " · ",
                  value.result.parserModel || "多模态解析模型"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { ref: closeButtonRef, type: "button", "aria-label": "关闭简历预览", disabled: loading, onClick: onClose, className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40", children: /* @__PURE__ */ jsxRuntimeExports.jsx(n, { size: 20 }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-7", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] leading-5 text-blue-900", children: "请核对模型抽取结果。原始文件不会保存；点击确认后只写入下方结构化经历，并供岗位匹配和本次面试使用。" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 grid min-w-0 gap-4 lg:grid-cols-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "姓名", value: profile.name, onChange: (next) => update("name", next) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "目标岗位（逗号分隔）", value: profile.targetRoles.join("，"), onChange: (next) => update("targetRoles", splitEditorTags(next)) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorTextArea, { label: "个人概述", rows: 4, value: profile.summary, onChange: (next) => update("summary", next) }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "技能（逗号分隔）", value: profile.skills.join("，"), onChange: (next) => update("skills", splitEditorTags(next)) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "面试提醒（逗号分隔）", value: profile.interviewNotes.join("，"), onChange: (next) => update("interviewNotes", splitEditorTags(next)) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ResumePreviewSection,
                {
                  title: "项目经历",
                  count: profile.projects.length,
                  onAdd: () => update("projects", [...profile.projects, {
                    name: "",
                    role: "",
                    description: "",
                    actions: [],
                    results: [],
                    technologies: []
                  }]),
                  children: profile.projects.map((project, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx(ResumePreviewItem, { title: project.name || `项目 ${index2 + 1}`, onRemove: () => update("projects", profile.projects.filter((_, itemIndex) => itemIndex !== index2)), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "项目名称", value: project.name, onChange: (next) => update("projects", replaceArrayItem(profile.projects, index2, { ...project, name: next })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "承担角色", value: project.role, onChange: (next) => update("projects", replaceArrayItem(profile.projects, index2, { ...project, role: next })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sm:col-span-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorTextArea, { label: "项目背景 / 描述", rows: 3, value: project.description, onChange: (next) => update("projects", replaceArrayItem(profile.projects, index2, { ...project, description: next })) }) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorTextArea, { label: "关键行动（每行一项）", rows: 3, value: project.actions.join("\n"), onChange: (next) => update("projects", replaceArrayItem(profile.projects, index2, { ...project, actions: splitEditorLines(next) })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorTextArea, { label: "结果（每行一项）", rows: 3, value: project.results.join("\n"), onChange: (next) => update("projects", replaceArrayItem(profile.projects, index2, { ...project, results: splitEditorLines(next) })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sm:col-span-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "技术 / 方法（逗号分隔）", value: project.technologies.join("，"), onChange: (next) => update("projects", replaceArrayItem(profile.projects, index2, { ...project, technologies: splitEditorTags(next) })) }) })
                  ] }) }, `project-${index2}`))
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ResumePreviewSection,
                {
                  title: "工作经历",
                  count: profile.workExperience.length,
                  onAdd: () => update("workExperience", [...profile.workExperience, {
                    company: "",
                    title: "",
                    period: "",
                    responsibilities: [],
                    achievements: []
                  }]),
                  children: profile.workExperience.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx(ResumePreviewItem, { title: item.company || item.title || `工作经历 ${index2 + 1}`, onRemove: () => update("workExperience", profile.workExperience.filter((_, itemIndex) => itemIndex !== index2)), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "公司", value: item.company, onChange: (next) => update("workExperience", replaceArrayItem(profile.workExperience, index2, { ...item, company: next })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "职位", value: item.title, onChange: (next) => update("workExperience", replaceArrayItem(profile.workExperience, index2, { ...item, title: next })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "时间", value: item.period, onChange: (next) => update("workExperience", replaceArrayItem(profile.workExperience, index2, { ...item, period: next })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sm:col-span-3 grid gap-3 sm:grid-cols-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorTextArea, { label: "职责（每行一项）", rows: 3, value: item.responsibilities.join("\n"), onChange: (next) => update("workExperience", replaceArrayItem(profile.workExperience, index2, { ...item, responsibilities: splitEditorLines(next) })) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorTextArea, { label: "成果（每行一项）", rows: 3, value: item.achievements.join("\n"), onChange: (next) => update("workExperience", replaceArrayItem(profile.workExperience, index2, { ...item, achievements: splitEditorLines(next) })) })
                    ] })
                  ] }) }, `work-${index2}`))
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                ResumePreviewSection,
                {
                  title: "教育经历",
                  count: profile.education.length,
                  onAdd: () => update("education", [...profile.education, { school: "", degree: "", major: "", period: "" }]),
                  children: profile.education.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsx(ResumePreviewItem, { title: item.school || `教育经历 ${index2 + 1}`, onRemove: () => update("education", profile.education.filter((_, itemIndex) => itemIndex !== index2)), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3 sm:grid-cols-4", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "学校", value: item.school, onChange: (next) => update("education", replaceArrayItem(profile.education, index2, { ...item, school: next })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "学历", value: item.degree, onChange: (next) => update("education", replaceArrayItem(profile.education, index2, { ...item, degree: next })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "专业", value: item.major, onChange: (next) => update("education", replaceArrayItem(profile.education, index2, { ...item, major: next })) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "时间", value: item.period, onChange: (next) => update("education", replaceArrayItem(profile.education, index2, { ...item, period: next })) })
                  ] }) }, `education-${index2}`))
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] leading-5 text-slate-500", children: "确认后可继续修改简历；岗位匹配只使用结构化字段，不保存原 PDF 或图片。" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 justify-end gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, disabled: loading, className: "h-10 rounded-xl border border-slate-200 bg-white px-4 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40", children: "取消" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onConfirm, disabled: !canConfirm, className: "inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-5 text-[12px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300", children: [
                  loading && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 15 }),
                  "确认并保存简历"
                ] })
              ] })
            ] })
          ]
        }
      )
    }
  );
};
const ResumePreviewSection = ({ title, count, onAdd, children }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-5 rounded-2xl border border-slate-200 p-4", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-[12px] font-semibold text-slate-800", children: [
      title,
      " ",
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-normal text-slate-400", children: [
        "(",
        count,
        ")"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onAdd, className: "rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50", children: "添加" })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 space-y-3", children: count ? children : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-xl bg-slate-50 px-4 py-5 text-center text-[11px] text-slate-400", children: "暂无，可按需添加" }) })
] });
const ResumePreviewItem = ({ title, onRemove, children }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 rounded-xl bg-slate-50 p-4", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex items-center justify-between gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-w-0 truncate text-[11px] font-semibold text-slate-700", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onRemove, className: "shrink-0 text-[10px] text-slate-400 transition hover:text-red-600", children: "移除" })
  ] }),
  children
] });
const PracticeJdPreviewDialog = ({ result, fileName, loading, error: error2, onDocumentChange, onClose, onFindSimilar, onUse }) => {
  const closeButtonRef = reactExports.useRef(null);
  const document2 = result.document;
  const update = (key, value) => {
    onDocumentChange({ ...document2, [key]: value });
  };
  const updateLines = (key, value) => update(key, splitEditorLines(value));
  const updateExperience = (key, value) => update(key, nullableEditorNumber(value));
  const descriptionReady = Boolean(
    document2.normalizedText.trim() || document2.responsibilities.length || document2.requirements.length
  );
  const canConfirm = Boolean(document2.title.trim() && descriptionReady && !loading);
  reactExports.useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);
  reactExports.useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [loading, onClose]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6",
      onMouseDown: (event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "section",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "practice-jd-preview-title",
          className: "flex max-h-[94vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_36px_110px_-38px_rgba(0,0,0,0.85)]",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-start justify-between gap-5 border-b border-slate-200 px-6 py-5 sm:px-7", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "practice-jd-preview-title", className: "text-[21px] font-semibold tracking-tight text-slate-950", children: "确认 JD 解析结果" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700", children: [
                    "置信度 ",
                    Math.round(document2.confidence * 100),
                    "%"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1.5 truncate text-[11px] text-slate-500", children: [
                  fileName,
                  " · ",
                  result.parserModel || "多模态解析模型"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { ref: closeButtonRef, type: "button", "aria-label": "关闭 JD 预览", disabled: loading, onClick: onClose, className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40", children: /* @__PURE__ */ jsxRuntimeExports.jsx(n, { size: 20 }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-7", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-900", children: "文件内容由模型抽取，可能存在遗漏。请核对后再建档；原始文件不会保存，只有你确认的结构化岗位会写入岗位库。" }),
              document2.warnings.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold text-slate-700", children: "解析提示" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-1.5 space-y-1 text-[11px] leading-5 text-slate-600", children: document2.warnings.map((warning) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
                  "· ",
                  warning
                ] }, warning)) })
              ] }),
              error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(InlineError, { message: error2 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 grid gap-4 lg:grid-cols-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "岗位名称", required: true, value: document2.title, onChange: (value) => update("title", value) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "公司名称", value: document2.companyName, onChange: (value) => update("companyName", value) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "工作地点", value: document2.location, onChange: (value) => update("location", value) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "岗位类别", value: document2.category, onChange: (value) => update("category", value) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "用工类型", value: document2.employmentType, onChange: (value) => update("employmentType", value) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "学历要求", value: document2.education, onChange: (value) => update("education", value) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "薪资描述", value: document2.salaryLabel, onChange: (value) => update("salaryLabel", value) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "最低经验（年）", type: "number", value: document2.experienceMin ?? "", onChange: (value) => updateExperience("experienceMin", value) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "最高经验（年）", type: "number", value: document2.experienceMax ?? "", onChange: (value) => updateExperience("experienceMax", value) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorField, { label: "技能标签（逗号分隔）", value: document2.skills.join("，"), onChange: (value) => update("skills", splitEditorTags(value)) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorTextArea, { label: "规范化 JD", required: true, rows: 8, value: document2.normalizedText, onChange: (value) => update("normalizedText", value) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorTextArea, { label: "岗位职责（每行一项）", rows: 6, value: document2.responsibilities.join("\n"), onChange: (value) => updateLines("responsibilities", value) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(JdEditorTextArea, { label: "任职要求（每行一项）", rows: 6, value: document2.requirements.join("\n"), onChange: (value) => updateLines("requirements", value) })
                  ] })
                ] })
              ] }),
              document2.evidence.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-5 rounded-2xl border border-slate-200 px-4 py-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("summary", { className: "cursor-pointer text-[11px] font-semibold text-slate-700", children: [
                  "查看来源证据（",
                  document2.evidence.length,
                  "）"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 grid gap-2 sm:grid-cols-2", children: document2.evidence.map((evidence, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-5 text-slate-600", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "font-semibold text-slate-700", children: [
                    evidence.field,
                    evidence.page ? ` · 第 ${evidence.page} 页` : ""
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 break-words", children: evidence.excerpt })
                ] }, `${evidence.field}-${evidence.page ?? "none"}-${index2}`)) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] leading-5 text-slate-500", children: "“找相似岗位”只会把结构化意图交给受控检索，不允许模型直接访问数据库。" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 flex-wrap justify-end gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, disabled: loading, className: "h-10 rounded-xl border border-slate-200 bg-white px-4 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40", children: "取消" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onFindSimilar, disabled: !canConfirm, className: "h-10 rounded-xl border border-slate-300 bg-white px-4 text-[12px] font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40", children: "在岗位库找相似" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onUse, disabled: !canConfirm, className: "inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-5 text-[12px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300", children: [
                  loading && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 15 }),
                  "使用此 JD"
                ] })
              ] })
            ] })
          ]
        }
      )
    }
  );
};
const JdEditorField = ({ label, value, required, type = "text", onChange }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "mb-1.5 block text-[11px] font-semibold text-slate-700", children: [
    label,
    required && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-red-500", children: "*" })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type, min: type === "number" ? 0 : void 0, max: type === "number" ? 80 : void 0, value, onChange: (event) => onChange(event.target.value), className: "h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-[12px] text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" })
] });
const JdEditorTextArea = ({ label, value, rows, required, onChange }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "mb-1.5 block text-[11px] font-semibold text-slate-700", children: [
    label,
    required && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-red-500", children: "*" })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { rows, value, onChange: (event) => onChange(event.target.value), className: "w-full min-w-0 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] leading-5 text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" })
] });
const PracticeFilterSelect = ({ label, allLabel, value, options, optionLabels, includeAll = true, onChange }) => {
  const normalizedOptions = Array.from(new Set(options.map((item) => item.trim()).filter(Boolean)));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "relative min-w-0 max-w-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value, onChange: (event) => onChange(event.target.value), className: "h-9 max-w-[220px] appearance-none truncate rounded-xl border-0 bg-slate-100 pl-3 pr-8 text-[11px] text-slate-700 outline-none transition hover:bg-slate-200 focus:ring-2 focus:ring-slate-300", children: [
      includeAll && /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: allLabel ?? label }),
      normalizedOptions.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: option, children: optionLabels?.[option] ?? option }, option))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(s$8, { "aria-hidden": true, size: 12, className: "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" })
  ] });
};
const PracticeConfirmDialog = ({ title, message, confirmLabel, confirmTone = "default", busy = false, error: error2, onConfirm, onClose }) => {
  const cancelButtonRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);
  reactExports.useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, busy]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4", onMouseDown: (event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { role: "dialog", "aria-modal": "true", "aria-labelledby": "practice-confirm-title", className: "w-full max-w-[420px] overflow-hidden rounded-[22px] border border-white/70 bg-white shadow-[0_36px_110px_-38px_rgba(0,0,0,0.85)]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "practice-confirm-title", className: "text-[17px] font-semibold text-slate-950", children: title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[13px] leading-6 text-slate-600", children: message }),
      error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(InlineError, { message: error2 }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "flex justify-end gap-2 border-t border-slate-200 px-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { ref: cancelButtonRef, type: "button", onClick: onClose, disabled: busy, className: "h-10 rounded-xl border border-slate-200 bg-white px-5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60", children: "取消" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: onConfirm,
          disabled: busy,
          className: `inline-flex h-10 items-center gap-2 rounded-xl px-6 text-[12px] font-semibold text-white transition disabled:cursor-wait disabled:opacity-70 ${confirmTone === "danger" ? "bg-rose-600 hover:bg-rose-500" : "bg-slate-950 hover:bg-slate-800"}`,
          children: [
            busy && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 15 }),
            confirmLabel
          ]
        }
      )
    ] })
  ] }) });
};
function parseLinesToList(value) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}
const PracticeCustomJobFormDialog = ({ mode: mode2, initial, saving, error: error2, onSubmit, onClose }) => {
  const [title, setTitle] = reactExports.useState(initial?.title ?? "");
  const [description, setDescription] = reactExports.useState(initial?.description ?? "");
  const [companyName, setCompanyName] = reactExports.useState(initial?.companyName ?? "");
  const [location, setLocation] = reactExports.useState(initial?.location ?? "");
  const [category, setCategory] = reactExports.useState(initial?.category ?? "");
  const [employmentType, setEmploymentType] = reactExports.useState(initial?.employmentType ?? "");
  const [education, setEducation] = reactExports.useState(initial?.education ?? "");
  const [experienceMin, setExperienceMin] = reactExports.useState(initial?.experienceMin != null ? String(initial.experienceMin) : "");
  const [experienceMax, setExperienceMax] = reactExports.useState(initial?.experienceMax != null ? String(initial.experienceMax) : "");
  const [salaryLabel, setSalaryLabel] = reactExports.useState(initial?.salaryLabel ?? "");
  const [summary, setSummary] = reactExports.useState(initial?.summary ?? "");
  const [tags, setTags] = reactExports.useState((initial?.tags ?? []).join("\n"));
  const [responsibilities, setResponsibilities] = reactExports.useState((initial?.responsibilities ?? []).join("\n"));
  const [requirements, setRequirements] = reactExports.useState((initial?.requirements ?? []).join("\n"));
  const [localError, setLocalError] = reactExports.useState(null);
  const titleInputRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    titleInputRef.current?.focus();
  }, []);
  reactExports.useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);
  function submit(event) {
    event.preventDefault();
    if (saving) return;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle) {
      setLocalError("请填写岗位名称");
      return;
    }
    if (!trimmedDescription) {
      setLocalError("请填写岗位描述（JD 正文）");
      return;
    }
    setLocalError(null);
    const minValue = experienceMin.trim() === "" ? void 0 : Number(experienceMin);
    const maxValue = experienceMax.trim() === "" ? void 0 : Number(experienceMax);
    const input = {
      title: trimmedTitle,
      description: trimmedDescription,
      companyName: companyName.trim() || void 0,
      location: location.trim() || void 0,
      category: category.trim() || void 0,
      employmentType: employmentType.trim() || void 0,
      education: education.trim() || void 0,
      experienceMin: minValue != null && Number.isFinite(minValue) && minValue >= 0 ? minValue : void 0,
      experienceMax: maxValue != null && Number.isFinite(maxValue) && maxValue >= 0 ? maxValue : void 0,
      salaryLabel: salaryLabel.trim() || void 0,
      summary: summary.trim() || void 0,
      tags: parseLinesToList(tags),
      responsibilities: parseLinesToList(responsibilities),
      requirements: parseLinesToList(requirements)
    };
    onSubmit(input);
  }
  const shownError = error2 || localError;
  const fieldClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none transition placeholder:text-slate-400 focus:border-slate-400";
  const textareaClass2 = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-6 outline-none transition placeholder:text-slate-400 focus:border-slate-400";
  const labelClass = "text-[12px] font-semibold text-slate-900";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6", onMouseDown: (event) => {
    if (event.target === event.currentTarget && !saving) onClose();
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { role: "dialog", "aria-modal": "true", "aria-labelledby": "practice-custom-job-title", className: "flex max-h-[92vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_36px_110px_-38px_rgba(0,0,0,0.85)]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-start justify-between gap-5 border-b border-slate-200 px-7 py-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "practice-custom-job-title", className: "text-[20px] font-semibold tracking-tight text-slate-950", children: mode2 === "edit" ? "编辑自定义岗位" : "新建自定义岗位" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[12px] text-slate-500", children: "填写 JD 后即可用它进行模拟面试。仅「岗位名称」与「岗位描述」为必填项。" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", "aria-label": "关闭", onClick: onClose, disabled: saving, className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60", children: /* @__PURE__ */ jsxRuntimeExports.jsx(n, { size: 20 }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: submit, className: "flex min-h-0 flex-1 flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 space-y-4 overflow-y-auto px-7 py-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: labelClass, children: [
            "岗位名称 ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-rose-500", children: "*" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { ref: titleInputRef, value: title, onChange: (event) => setTitle(event.target.value), placeholder: "例如：高级前端工程师", className: fieldClass })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: labelClass, children: [
            "岗位描述（JD 正文） ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-rose-500", children: "*" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { value: description, onChange: (event) => setDescription(event.target.value), rows: 6, placeholder: "粘贴或填写完整的岗位描述，Agent 会据此提问。", className: textareaClass2 })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: labelClass, children: "公司名称" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: companyName, onChange: (event) => setCompanyName(event.target.value), placeholder: "选填", className: fieldClass })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: labelClass, children: "工作地点" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: location, onChange: (event) => setLocation(event.target.value), placeholder: "选填", className: fieldClass })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: labelClass, children: "岗位类别" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: category, onChange: (event) => setCategory(event.target.value), placeholder: "例如：研发 / 产品", className: fieldClass })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: labelClass, children: "用工类型" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: employmentType, onChange: (event) => setEmploymentType(event.target.value), className: fieldClass, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "不限" }),
              EMPLOYMENT_TYPE_FILTERS.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: option, children: option }, option))
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: labelClass, children: "学历要求" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: education, onChange: (event) => setEducation(event.target.value), className: fieldClass, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "不限" }),
              EDUCATION_FILTERS.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: option, children: option }, option))
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: labelClass, children: "薪资" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: salaryLabel, onChange: (event) => setSalaryLabel(event.target.value), placeholder: "例如：25-40K·14薪", className: fieldClass })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: labelClass, children: "最低经验（年）" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: experienceMin, onChange: (event) => setExperienceMin(event.target.value), type: "number", min: 0, placeholder: "选填", className: fieldClass })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: labelClass, children: "最高经验（年）" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: experienceMax, onChange: (event) => setExperienceMax(event.target.value), type: "number", min: 0, placeholder: "选填", className: fieldClass })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: labelClass, children: "一句话概述" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: summary, onChange: (event) => setSummary(event.target.value), placeholder: "选填，用于列表卡片摘要", className: fieldClass })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: labelClass, children: [
            "技能标签",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 font-normal text-slate-400", children: "每行一个" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { value: tags, onChange: (event) => setTags(event.target.value), rows: 3, placeholder: "React\nTypeScript\nNode.js", className: textareaClass2 })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: labelClass, children: [
            "岗位职责",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 font-normal text-slate-400", children: "每行一条" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { value: responsibilities, onChange: (event) => setResponsibilities(event.target.value), rows: 3, placeholder: "每行填写一条职责", className: textareaClass2 })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: labelClass, children: [
            "任职要求",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 font-normal text-slate-400", children: "每行一条" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { value: requirements, onChange: (event) => setRequirements(event.target.value), rows: 3, placeholder: "每行填写一条要求", className: textareaClass2 })
        ] }),
        shownError && /* @__PURE__ */ jsxRuntimeExports.jsx(InlineError, { message: shownError })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "flex shrink-0 justify-end gap-2 border-t border-slate-200 px-7 py-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, disabled: saving, className: "h-10 rounded-xl border border-slate-200 bg-white px-5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60", children: "取消" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "submit", disabled: saving, className: "inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-6 text-[12px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70", children: [
          saving && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 15 }),
          mode2 === "edit" ? "保存修改" : "创建岗位"
        ] })
      ] })
    ] })
  ] }) });
};
const PracticeJobDialog = ({ job, loading, config, resumeReady, resumeName, onConfigChange, onClose, onConfirm, onEdit, onDelete }) => {
  const closeButtonRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);
  reactExports.useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6", onMouseDown: (event) => {
    if (event.target === event.currentTarget) onClose();
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { role: "dialog", "aria-modal": "true", "aria-labelledby": "practice-job-dialog-title", className: "flex max-h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_36px_110px_-38px_rgba(0,0,0,0.85)]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-start justify-between gap-5 border-b border-slate-200 px-7 py-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "practice-job-dialog-title", className: "text-[24px] font-semibold tracking-tight text-slate-950", children: job.title }),
          job.isSynthetic && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-500", children: "模拟岗位" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1.5 text-[12px] text-slate-500", children: [job.companyName, job.location, job.salaryLabel, formatExperience(job), job.education].filter(Boolean).join(" · ") || "岗位信息以本页为准" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [
        onEdit && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onEdit, className: "inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(a$1, { "aria-hidden": true, size: 15 }),
          "编辑"
        ] }),
        onDelete && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onDelete, className: "inline-flex h-9 items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 text-[12px] font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(n$1, { "aria-hidden": true, size: 15 }),
          "删除"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { ref: closeButtonRef, type: "button", "aria-label": "关闭岗位详情", onClick: onClose, className: "flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900", children: /* @__PURE__ */ jsxRuntimeExports.jsx(n, { size: 20 }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.35fr)_minmax(350px,0.85fr)]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6 px-7 py-6 lg:border-r lg:border-slate-200", children: [
        loading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[12px] text-slate-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 16 }),
          "正在加载完整 JD…"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[14px] font-semibold text-slate-900", children: "岗位概述" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 whitespace-pre-wrap text-[13px] leading-7 text-slate-600", children: job.description || job.summary || "暂无更多岗位描述。" })
        ] }),
        job.responsibilities.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(JobDetailList, { title: "岗位职责", items: job.responsibilities }),
        job.requirements.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(JobDetailList, { title: "任职要求", items: job.requirements }),
        job.isSynthetic && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-400", children: "此 JD 仅用于模拟面试场景，不代表真实招聘机会。" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "space-y-6 bg-white px-7 py-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[17px] font-semibold text-slate-950", children: "本场面试配置" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1.5 text-[11px] leading-relaxed text-slate-500", children: "选择面试官、难度与预计时长。Agent 会按能力覆盖和回答质量决定追问与结束时机。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SegmentField, { label: "面试官身份", options: INTERVIEWERS, value: config.interviewer, onChange: (value) => onConfigChange("interviewer", value) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SegmentField, { label: "面试难度", options: DIFFICULTIES, value: config.difficulty, onChange: (value) => onConfigChange("difficulty", value) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SegmentField, { label: "预计时长", options: DURATION_MINUTES.map(String), value: String(config.durationMinutes), suffix: "分钟", onChange: (value) => onConfigChange("durationMinutes", Number(value)) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("fieldset", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("legend", { className: "text-[12px] font-semibold text-slate-900", children: "回答提交方式" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                "aria-pressed": config.submissionMode === "manual",
                onClick: () => onConfigChange("submissionMode", "manual"),
                className: "rounded-xl border border-slate-950 bg-slate-50 px-3 py-3 text-left focus:outline-none focus:ring-2 focus:ring-slate-300",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] font-semibold text-slate-900", children: "手动确认" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[10px] leading-4 text-slate-500", children: "说完后点击提交，不会打断思考" })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", disabled: true, "aria-disabled": "true", className: "cursor-not-allowed rounded-xl border border-slate-200 px-3 py-3 text-left opacity-55", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] font-semibold text-slate-700", children: "自动判断" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[10px] leading-4 text-slate-400", children: "需要语音活动检测，暂不可选" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(h$1, { className: "mt-0.5 shrink-0 text-slate-600", size: 17 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "音频只用于实时转写且不保存；摄像头画面仅在本机显示。简历、JD 与回答文本会发送给当前模型供应商；面试中会实时生成客观评价以决定追问，即使最后跳过复盘也已发生该评价调用。" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "flex flex-col gap-3 border-t border-slate-200 px-7 py-5 sm:flex-row sm:items-center sm:justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-[11px] ${resumeReady ? "text-emerald-700" : "text-amber-700"}`, children: resumeReady ? `简历已就绪 · ${resumeName || "已完成解析"}` : "开始前必须先上传并完成简历解析" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, className: "h-10 rounded-xl border border-slate-200 bg-white px-5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50", children: "关闭" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onConfirm, disabled: !resumeReady, className: "h-10 rounded-xl bg-slate-950 px-6 text-[12px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300", children: "进入面试准备" })
      ] })
    ] })
  ] }) });
};
const JobDetailList = ({ title, items }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[13px] font-semibold text-slate-900", children: title }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-2 text-[12px] leading-relaxed text-slate-600", children: items.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(n$6, { className: "mt-1 shrink-0 text-blue-600", size: 14 }),
    item
  ] }, item)) })
] });
const PracticePreparationView = ({
  config,
  resume,
  job,
  cameraEnabled,
  answerMode,
  microphoneStatus,
  microphoneLevel,
  cameraStatus,
  speakerStatus,
  speakerEnabled,
  checking,
  starting,
  ready,
  error: error2,
  videoRef,
  onAnswerModeChange,
  onCameraEnabledChange,
  onSpeakerEnabledChange,
  onBack,
  onStart
}) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full overflow-y-auto bg-[#fbfbfa] px-5 py-6 sm:px-8", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto w-full max-w-[980px]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-start justify-between gap-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold tracking-[0.15em] text-blue-700", children: "面试准备" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-2 text-[26px] font-normal tracking-tight text-slate-950", children: "确认设备" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[12px] text-slate-500", children: "进入页面后会自动检测麦克风、摄像头和扬声器，就绪后即可开始面试。" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onBack, className: "flex h-9 items-center gap-2 rounded-full px-3 text-[12px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-900", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(s$a, { size: 16 }),
        "返回"
      ] })
    ] }),
    error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(InlineError, { message: error2 }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "relative flex min-h-[340px] overflow-hidden rounded-[22px] bg-slate-950", children: [
        cameraEnabled ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("video", { ref: videoRef, "aria-label": "摄像头本地预览", autoPlay: true, muted: true, playsInline: true, className: `h-full min-h-[340px] w-full object-cover ${cameraStatus === "granted" ? "opacity-100" : "opacity-0"}` }),
          cameraStatus !== "granted" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(s$1, { size: 30, weight: "light" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 text-[13px]", children: cameraStatus === "checking" ? "正在请求摄像头权限…" : cameraStatus === "denied" ? "摄像头权限未开启" : "检测后将在这里显示本地预览" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-[400px] text-[10px] leading-5 text-slate-400", children: "画面不录制、不截帧，也不会发送到 Climb 服务端。" })
          ] })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 flex-col items-center justify-center px-6 text-center text-white", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(c$1, { size: 30, weight: "light" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 text-[13px]", children: "摄像头已关闭" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[10px] text-slate-400", children: "你仍可继续语音或文字面试。" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute bottom-4 left-4 rounded-full bg-black/55 px-3 py-1.5 text-[10px] text-white", children: "本地预览" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-[22px] border border-slate-200 bg-white p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[15px] font-semibold text-slate-950", children: "设备检查" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] text-slate-400", children: "自动检测中，随时可关闭摄像头或改用文字回答。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 grid gap-2.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            DeviceStatusRow,
            {
              label: "麦克风",
              status: microphoneStatus,
              enabled: answerMode === "voice",
              required: answerMode === "voice",
              detail: answerMode === "text" ? "已切换为文字回答" : "点击卡片可切换为文字回答",
              onToggle: () => onAnswerModeChange(answerMode === "voice" ? "text" : "voice")
            }
          ),
          answerMode === "voice" && microphoneStatus === "granted" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-slate-200 px-4 py-3", "aria-label": "麦克风本地音量检测结果", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-[10px] text-slate-500", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "本地输入峰值" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                microphoneLevel ?? 0,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full rounded-full bg-emerald-500 transition-[width]", style: { width: `${Math.max(2, microphoneLevel ?? 0)}%` } }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[10px] text-slate-400", children: "只在设备检测时本地采样，不录音、不上传。" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            DeviceStatusRow,
            {
              label: "摄像头",
              status: cameraStatus,
              enabled: cameraEnabled,
              detail: cameraEnabled ? "仅在本机预览，不上传画面" : "已关闭摄像头",
              onToggle: () => onCameraEnabledChange(!cameraEnabled)
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            DeviceStatusRow,
            {
              label: "扬声器",
              status: speakerStatus,
              enabled: speakerEnabled,
              required: speakerEnabled,
              detail: speakerEnabled ? "开启后可听到面试官提问" : "已关闭语音播报，仅看字幕",
              onToggle: () => onSpeakerEnabledChange(!speakerEnabled)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-[10px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(InfoRow, { label: "岗位", value: job.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(InfoRow, { label: "简历", value: resume.fileName }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(InfoRow, { label: "面试官", value: config.interviewer }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(InfoRow, { label: "难度 / 结束方式", value: `${config.difficulty} · Agent 自主收尾` }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(InfoRow, { label: "预计时长", value: `${config.durationMinutes} 分钟` }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(InfoRow, { label: "提交方式", value: config.submissionMode === "manual" ? "手动确认" : "自动判断" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            "data-testid": "practice-ready-start",
            onClick: onStart,
            disabled: !ready || starting || checking,
            className: "mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300",
            children: [
              (starting || checking) && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 16 }),
              starting ? "正在进入面试…" : checking ? "正在检测设备…" : "进入面试"
            ]
          }
        )
      ] })
    ] })
  ] }) });
};
const DeviceStatusRow = ({ label, status, enabled: enabled2, required, detail, onToggle }) => {
  const ready = status === "granted" || status === "skipped";
  const labelText = {
    idle: "等待检测",
    checking: "正在请求权限",
    granted: "已就绪",
    denied: "权限被拒绝",
    skipped: "已关闭",
    unavailable: "设备不可用"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      "aria-pressed": enabled2,
      "aria-label": `${enabled2 ? "关闭" : "开启"}${label}`,
      onClick: onToggle,
      className: "flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[12px] font-semibold text-slate-800", children: [
            label,
            required && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-red-500", children: "*" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[11px] text-slate-500", children: detail || (required ? "语音面试需要此权限" : "可选设备") })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex shrink-0 items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-1 text-[10px] font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : status === "denied" || status === "unavailable" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`, children: labelText[status] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", className: `relative h-5 w-9 rounded-full transition ${enabled2 ? "bg-slate-950" : "bg-slate-200"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled2 ? "translate-x-[18px]" : "translate-x-0.5"}` }) })
        ] })
      ]
    }
  );
};
const PracticeCompletionView = ({ config, exchanges, loading, error: error2, onGenerateReport, onSkipReport }) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto flex h-full min-h-[560px] w-full max-w-[820px] items-center justify-center overflow-y-auto px-5 py-8", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "w-full rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-[0_24px_80px_-48px_rgba(15,23,42,0.55)]", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700", children: /* @__PURE__ */ jsxRuntimeExports.jsx(n$6, { size: 23, weight: "bold" }) }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 text-[12px] font-semibold text-emerald-700", children: "本场面试已结束" }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "mt-2 text-[24px] font-semibold text-slate-950", children: [
    config.targetRole,
    " · 完成 ",
    exchanges.length,
    " 轮问答"
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mx-auto mt-3 max-w-[600px] text-[13px] leading-relaxed text-slate-500", children: "目前尚未生成复盘。你可以让 AI 基于本场问答生成结构化报告，也可以直接结束，本次不会在后台自动调用报告模型。" }),
  error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(InlineError, { message: error2 }) }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto mt-6 grid max-w-[620px] gap-3 sm:grid-cols-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onGenerateReport, disabled: loading, className: "rounded-xl bg-blue-600 px-5 py-4 text-left text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-[14px] font-semibold", children: loading ? "正在生成复盘…" : "生成复盘报告" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1 block text-[11px] text-blue-100", children: "综合评分、能力维度、优势与改进建议" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onSkipReport, disabled: loading, className: "rounded-xl border border-slate-200 bg-white px-5 py-4 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-[14px] font-semibold", children: "暂不生成" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1 block text-[11px] text-slate-500", children: "结束本场并前往面试记录，不调用复盘模型" })
    ] })
  ] })
] }) });
const SegmentField = ({ label, options, value, suffix, onChange }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("fieldset", { children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("legend", { className: "mb-2 text-[12px] font-semibold text-slate-900", children: label }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-2 sm:grid-cols-3", children: options.map((option) => {
    const selected = option === value;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        "aria-pressed": selected,
        onClick: () => onChange(option),
        className: `min-h-12 rounded-xl border px-2.5 py-2 text-[11px] font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${selected ? "border-slate-950 bg-slate-50 text-slate-950" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`,
        children: [
          option,
          suffix
        ]
      },
      option
    );
  }) })
] });
const PracticeSessionView = ({
  config,
  resume,
  exchanges,
  currentQuestion,
  draftAnswer,
  questionNumber,
  progress,
  questionLoading,
  turnSaving,
  agentStepStage,
  reportLoading,
  recording,
  voiceConnecting,
  ttsSpeaking,
  ttsPlaybackPhase,
  autoSpeak,
  cameraEnabled,
  answerMode,
  paused,
  elapsedSeconds,
  error: error2,
  answerRef,
  videoRef,
  onAnswerChange,
  onSubmit,
  onRetryQuestion,
  onFinish,
  onToggleRecording,
  onToggleSpeak,
  onToggleCamera,
  onTogglePause,
  onSpeak,
  onExit
}) => {
  const [finishConfirmOpen, setFinishConfirmOpen] = reactExports.useState(false);
  const [waitRotation, setWaitRotation] = reactExports.useState({ key: "", index: 0 });
  const publicWaitStage = resolvePracticeAgentPublicWaitStage({
    questionNumber,
    agentStepStage,
    difficulty: config.difficulty,
    turnSaving
  });
  const waitMessages = practiceAgentWaitMessages({
    questionNumber,
    agentStepStage,
    difficulty: config.difficulty,
    turnSaving
  });
  const waitingForQuestion = questionLoading && !currentQuestion;
  const waitRotationKey = `${config.difficulty}:${publicWaitStage}:${waitingForQuestion}:${waitMessages.length}`;
  const waitRotationIndex = waitRotation.key === waitRotationKey ? waitRotation.index : 0;
  reactExports.useEffect(() => {
    setWaitRotation({ key: waitRotationKey, index: 0 });
    if (!waitingForQuestion || waitMessages.length < 2) return;
    const timer2 = window.setInterval(() => {
      setWaitRotation((current) => current.key === waitRotationKey ? { key: waitRotationKey, index: current.index + 1 } : { key: waitRotationKey, index: 1 });
    }, PRACTICE_AGENT_WAIT_ROTATION_MS);
    return () => window.clearInterval(timer2);
  }, [waitRotationKey, waitingForQuestion, waitMessages.length]);
  const waitMessage = practiceAgentWaitMessage(waitMessages, waitRotationIndex);
  const speechPlaybackLabel = ttsPlaybackPhase === "preparing" ? "语音生成中" : ttsPlaybackPhase === "playing" ? "播报中" : "重播";
  const answerDisabled = paused || questionLoading || turnSaving || reportLoading || voiceConnecting || recording || !currentQuestion || !draftAnswer.trim();
  const restartDisabled = paused || questionLoading || turnSaving || reportLoading || voiceConnecting || recording || !draftAnswer.trim();
  const answerActionTitle = paused ? "面试已暂停" : turnSaving ? "正在保存本轮回答" : questionLoading ? currentQuestion ? "问题正在生成" : waitMessage : voiceConnecting ? "正在连接麦克风" : recording ? "正在听你回答" : draftAnswer.trim() ? "回答已就绪" : "请回答当前问题";
  const answerActionHint = turnSaving ? "保存完成后将继续下一轮。" : recording ? "说完后先停止麦克风，再确认发送。" : draftAnswer.trim() ? "确认后，本轮回答才会发送给 AI 面试官。" : answerMode === "text" ? "输入回答后点击“我说完了”。" : "可使用麦克风回答，也可以直接输入文字。";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full min-h-[540px] flex-col overflow-hidden bg-[#f6f6f5] text-slate-950", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "relative flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "max-w-[260px] truncate text-[12px] font-semibold", children: config.targetRole }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-600", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-red-500" }),
          formatSessionTime(elapsedSeconds)
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-600", children: [
          "第 ",
          Math.max(1, questionNumber),
          " 轮 · 预计 ",
          config.durationMinutes,
          " 分钟"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "hidden rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-600 sm:inline", children: [
          config.interviewer,
          " · ",
          config.difficulty
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onExit, "aria-label": "保留会话并返回岗位库", title: "保留会话并返回岗位库", className: "flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900", children: /* @__PURE__ */ jsxRuntimeExports.jsx(n, { size: 17 }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute bottom-0 left-0 h-px bg-slate-950 transition-[width]", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": progress, style: { width: `${progress}%` } })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "min-h-0 flex-1 overflow-y-auto px-4 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex min-h-full w-full max-w-[1024px] flex-col gap-3", children: [
      error2 && /* @__PURE__ */ jsxRuntimeExports.jsx(InlineError, { message: error2 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "relative min-h-[200px] rounded-[22px] border border-slate-200 bg-white p-5 sm:p-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] font-semibold text-slate-800", children: [
              "AI ",
              config.interviewer
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-0.5 text-[10px] text-slate-400", children: [
              "第 ",
              questionNumber,
              " 题 · AI 对话字幕"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onSpeak, disabled: !currentQuestion || questionLoading || turnSaving || recording || voiceConnecting || ttsSpeaking, className: "flex h-8 items-center gap-1.5 rounded-full px-3 text-[10px] text-slate-500 transition hover:bg-slate-100 disabled:opacity-40", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(c$3, { size: 15 }),
            speechPlaybackLabel
          ] })
        ] }),
        questionLoading && !currentQuestion ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex items-center gap-2 text-[13px] text-slate-500", role: "status", "aria-live": "polite", "aria-atomic": "true", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 17, "aria-hidden": "true" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: waitMessage }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: practiceAgentWaitMessage(waitMessages, 0) })
        ] }) : currentQuestion ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-5 whitespace-pre-wrap break-words text-[16px] font-normal leading-8 text-slate-900", children: currentQuestion }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 text-[13px] text-slate-600", children: [
          "问题生成失败。",
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onRetryQuestion, className: "ml-2 font-medium text-blue-700", children: "重新生成" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "mt-5 block text-[10px] font-medium text-slate-400", children: [
          "你的回答 / 实时转写",
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              ref: answerRef,
              value: draftAnswer,
              onChange: (event) => onAnswerChange(event.target.value),
              onKeyDown: (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") onSubmit();
              },
              disabled: paused || questionLoading || turnSaving || voiceConnecting || recording,
              placeholder: voiceConnecting ? "正在连接实时语音识别…" : recording ? "正在实时转写，结束录音后可以修改。" : answerMode === "text" ? "请输入回答，Ctrl/Cmd + Enter 提交。" : "可以直接输入，也可以打开麦克风回答。",
              className: "mt-2 min-h-[74px] w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-[13px] font-normal leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:ring-1 focus:ring-slate-300 disabled:opacity-60"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "relative flex min-h-[230px] flex-1 overflow-hidden rounded-[22px] bg-slate-950", children: [
        cameraEnabled ? /* @__PURE__ */ jsxRuntimeExports.jsx("video", { ref: videoRef, "aria-label": "面试中的本地摄像头画面", autoPlay: true, muted: true, playsInline: true, className: "h-full min-h-[230px] w-full object-cover" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 flex-col items-center justify-center text-center text-slate-300", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(c$1, { size: 32, weight: "light" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[12px]", children: "摄像头已关闭" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "absolute bottom-4 left-4 rounded-full bg-black/60 px-3 py-1.5 text-[10px] text-white", children: [
          resume?.profile?.name || "候选人",
          "（我）"
        ] }),
        paused && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 flex items-center justify-center bg-slate-950/65 text-[14px] font-medium text-white", children: "面试已暂停" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "section",
      {
        "data-testid": "practice-answer-actions",
        role: "group",
        "aria-label": "回答操作",
        className: "shrink-0 border-t border-slate-200 bg-white px-4 py-2.5 shadow-[0_-10px_30px_-24px_rgba(15,23,42,0.45)]",
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex w-full max-w-[1024px] flex-wrap items-center justify-between gap-2.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", "aria-live": waitingForQuestion ? "off" : "polite", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] font-semibold text-slate-900", children: answerActionTitle }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 hidden truncate text-[10px] text-slate-500 sm:block", children: answerActionHint })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => onAnswerChange(""),
                disabled: restartDisabled,
                "aria-label": "清空当前回答并重说",
                className: "flex h-11 min-w-[92px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(i$4, { size: 17, weight: "bold" }),
                  "重说"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: onSubmit,
                disabled: answerDisabled,
                "aria-label": "提交本轮回答",
                className: "flex h-11 min-w-[136px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(n$6, { size: 17, weight: "bold" }),
                  "我说完了"
                ]
              }
            )
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 rounded-xl bg-slate-100 p-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-lg bg-white px-3 py-2 text-[10px] font-semibold text-slate-900 shadow-sm", children: "手动" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-disabled": "true", className: "px-3 py-2 text-[10px] text-slate-400", children: "自动" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(RoomControlButton, { label: answerMode === "text" ? "文字模式" : recording ? "停止" : voiceConnecting ? "连接中" : ttsSpeaking ? speechPlaybackLabel : "麦克风", active: recording, danger: recording, disabled: answerMode === "text" || paused || questionLoading || turnSaving || voiceConnecting || ttsSpeaking, onClick: onToggleRecording, icon: recording ? /* @__PURE__ */ jsxRuntimeExports.jsx(i$2, { size: 18 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(m$1, { size: 18 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(RoomControlButton, { label: "画面", active: cameraEnabled, onClick: onToggleCamera, icon: cameraEnabled ? /* @__PURE__ */ jsxRuntimeExports.jsx(s$1, { size: 18 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(c$1, { size: 18 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(RoomControlButton, { label: paused ? "继续" : "暂停", active: paused, onClick: onTogglePause, icon: paused ? /* @__PURE__ */ jsxRuntimeExports.jsx(n$3, { size: 18 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(n$4, { size: 18 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(RoomControlButton, { label: "结束本场", danger: true, disabled: reportLoading, onClick: () => setFinishConfirmOpen(true), icon: /* @__PURE__ */ jsxRuntimeExports.jsx(i$1, { size: 18 }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", disabled: recording || voiceConnecting, onClick: () => onToggleSpeak(!autoSpeak), className: `flex h-10 items-center gap-2 rounded-xl px-3 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-40 ${autoSpeak ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-100"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(c$2, { size: 18 }),
        "语音播报"
      ] })
    ] }),
    finishConfirmOpen && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-5", role: "dialog", "aria-modal": "true", "aria-labelledby": "practice-finish-title", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-[440px] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "practice-finish-title", className: "text-[18px] font-semibold text-slate-950", children: "确认结束本场面试？" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[12px] leading-6 text-slate-600", children: "已提交的回答会保留；当前尚未提交的回答会被放弃，也不会进入复盘。如果只是暂时离开，请取消后点击右上角，系统会保留会话。" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex justify-end gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setFinishConfirmOpen(false), className: "h-10 rounded-xl border border-slate-200 px-4 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50", children: "继续面试" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
          setFinishConfirmOpen(false);
          onFinish();
        }, className: "h-10 rounded-xl bg-red-500 px-4 text-[12px] font-semibold text-white transition hover:bg-red-600", children: "结束本场" })
      ] })
    ] }) })
  ] });
};
const RoomControlButton = ({ label, icon, active, danger, disabled, onClick }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick, disabled, className: `flex h-11 min-w-12 flex-col items-center justify-center rounded-xl px-2 text-[9px] transition disabled:cursor-not-allowed disabled:opacity-40 ${danger ? "bg-red-500 text-white hover:bg-red-600" : active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`, children: [
  icon,
  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-0.5", children: label })
] });
const PracticeReportView = ({ config, report, exchanges, onRestart, onOpenHistory }) => {
  const scoreTone = report.overallScore >= 80 ? "text-emerald-700 bg-emerald-50" : report.overallScore >= 60 ? "text-blue-700 bg-blue-50" : "text-amber-700 bg-amber-50";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex h-full max-w-[1040px] flex-col gap-5 overflow-y-auto px-5 py-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "rounded-xl border border-slate-200 bg-white p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col justify-between gap-5 sm:flex-row sm:items-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full ${scoreTone}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "text-[30px] leading-none", children: report.overallScore }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1 text-[11px] font-medium", children: "综合评分" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] font-semibold text-blue-700", children: "本场复盘" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "mt-1 text-[23px] font-semibold text-slate-950", children: [
            config.targetRole,
            " · 实际完成 ",
            exchanges.length,
            " 轮问答"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-[720px] text-[13px] leading-relaxed text-slate-600", children: report.summary })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onRestart, className: "h-10 rounded-lg border border-slate-200 bg-white px-5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50", children: "再练一次" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onOpenHistory, className: "h-10 rounded-lg bg-blue-600 px-5 text-[13px] font-semibold text-white transition hover:bg-blue-700", children: "返回面试记录" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-slate-200 bg-white p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[16px] font-semibold text-slate-950", children: "能力维度" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-5 grid gap-4 md:grid-cols-2", children: report.dimensions.map((dimension) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-slate-200 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-[13px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-800", children: dimension.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-slate-900", children: dimension.score })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 h-2 overflow-hidden rounded-full bg-slate-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full rounded-full bg-blue-600", style: { width: `${dimension.score}%` } }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[12px] leading-relaxed text-slate-500", children: dimension.feedback })
      ] }, dimension.name)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "grid gap-4 lg:grid-cols-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ReportList, { title: "本场优势", items: report.strengths, tone: "success", empty: "暂未识别到稳定优势。" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ReportList, { title: "优先改进", items: report.improvements, tone: "warning", empty: "暂无明确改进项。" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ReportList, { title: "下一步练习", items: report.nextActions, tone: "info", empty: "建议针对本场薄弱题再练一次。" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "rounded-xl border border-slate-200 bg-white p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-[14px] font-semibold text-slate-900", children: "查看本场完整问答" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 space-y-4 border-t border-slate-100 pt-4", children: exchanges.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[13px] font-medium text-slate-900", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "mr-2 text-blue-700", children: [
            "Q",
            index2 + 1
          ] }),
          item.question
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "rounded-lg bg-slate-50 px-4 py-3 text-[12px] leading-relaxed text-slate-600", children: item.answer })
      ] }, `${index2}-${item.question}`)) })
    ] })
  ] });
};
const ReportList = ({ title, items, tone, empty: empty2 }) => {
  const colors = tone === "success" ? "bg-emerald-50 text-emerald-700" : tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-slate-200 bg-white p-5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `inline-flex rounded-md px-2 py-1 text-[12px] font-semibold ${colors}`, children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-4 space-y-3 text-[12px] leading-relaxed text-slate-600", children: (items.length > 0 ? items : [empty2]).map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" }),
      item
    ] }, item)) })
  ] });
};
const InfoRow = ({ label, value }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "text-slate-400", children: label }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 break-words font-medium text-slate-700", children: value })
] });
const InlineError = ({ message }) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "alert", className: "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700", children: message });
function formatExperience(job) {
  const min = job.experienceMin;
  const max = job.experienceMax;
  if (min === null && max === null) return "";
  if (min !== null && max !== null) return min === max ? `${min}年经验` : `${min}-${max}年经验`;
  if (min !== null) return `${min}年以上经验`;
  return `${max}年以内经验`;
}
function formatAttachmentBytes(bytes) {
  if (bytes < 1024) return `${Math.max(0, bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function isPracticeJobSalaryBand(value) {
  return SALARY_FILTERS.some((option) => option.value === value);
}
function sortPracticeJobsByTitle(items) {
  return [...items].sort((left, right) => comparePracticeJobTitleText(left.title, right.title) || comparePracticeJobCompanyText(left.companyName, right.companyName) || comparePracticeJobOrdinalText(left.id, right.id));
}
const practiceJobTitleCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base"
});
function comparePracticeJobTitleText(left, right) {
  const normalizedLeft = normalizePracticeJobSortText(left);
  const normalizedRight = normalizePracticeJobSortText(right);
  const groupDifference = practiceJobTitleCharacterGroup(normalizedLeft) - practiceJobTitleCharacterGroup(normalizedRight);
  return groupDifference || practiceJobTitleCollator.compare(normalizedLeft, normalizedRight) || comparePracticeJobOrdinalText(normalizedLeft, normalizedRight);
}
function comparePracticeJobCompanyText(left, right) {
  const normalizedLeft = normalizePracticeJobSortText(left);
  const normalizedRight = normalizePracticeJobSortText(right);
  if (!normalizedLeft || !normalizedRight) {
    return normalizedLeft ? -1 : normalizedRight ? 1 : 0;
  }
  return practiceJobTitleCollator.compare(normalizedLeft, normalizedRight) || comparePracticeJobOrdinalText(normalizedLeft, normalizedRight);
}
function normalizePracticeJobSortText(value) {
  return value.normalize("NFKC").trim();
}
function practiceJobTitleCharacterGroup(value) {
  const firstCharacter = Array.from(value)[0] ?? "";
  if (/^[A-Za-z]$/u.test(firstCharacter)) return 0;
  if (new RegExp("^\\p{Script=Han}$", "u").test(firstCharacter)) return 1;
  return 2;
}
function comparePracticeJobOrdinalText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function isTrustedCompanyLogoUrl(value) {
  if (!value) return false;
  try {
    const url2 = new URL(value);
    const localDevelopmentAsset = url2.protocol === "http:" && (url2.hostname === "127.0.0.1" || url2.hostname === "localhost");
    return (url2.protocol === "https:" || localDevelopmentAsset) && !url2.username && !url2.password;
  } catch {
    return false;
  }
}
function splitEditorLines(value) {
  return Array.from(new Set(
    value.split(/\r?\n/u).map((item) => item.replace(/^\s*[-•·]\s*/u, "").trim()).filter(Boolean)
  )).slice(0, 30);
}
function replaceArrayItem(items, index2, value) {
  return items.map((item, itemIndex) => itemIndex === index2 ? value : item);
}
function splitEditorTags(value) {
  return Array.from(new Set(
    value.split(/[,，、;；\n]/u).map((item) => item.trim()).filter(Boolean)
  )).slice(0, 40);
}
function nullableEditorNumber(value) {
  if (!value.trim()) return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.min(80, Math.max(0, Math.round(numberValue)));
}
function practiceConfigToSessionSnapshot(config) {
  const interviewer = config.interviewer === "HR 面试官" ? "hr" : config.interviewer === "CEO 面试官" ? "ceo" : config.interviewer === "CTO 面试官" || config.interviewer === "技术面试官" ? "cto" : config.interviewer === "业务负责人" || config.interviewer === "业务面试官" ? "business" : "manager";
  const difficulty = config.difficulty === "压力面" || config.difficulty === "压力" ? "stress" : "normal";
  return {
    interviewer,
    difficulty,
    questionCount: config.questionCount,
    durationMinutes: config.durationMinutes,
    submissionMode: config.submissionMode,
    language: "zh-CN"
  };
}
function practiceConfigFromSessionSnapshot(snapshot, job) {
  const interviewer = snapshot.interviewer === "business" ? "业务负责人" : snapshot.interviewer === "hr" ? "HR 面试官" : snapshot.interviewer === "ceo" ? "CEO 面试官" : snapshot.interviewer === "cto" || snapshot.interviewer === "technical" ? "CTO 面试官" : "直属上级";
  const difficulty = snapshot.difficulty === "stress" ? "压力面" : "正常面";
  const questionCount = QUESTION_COUNTS.includes(snapshot.questionCount) ? snapshot.questionCount : 5;
  const durationMinutes = DURATION_MINUTES.includes(snapshot.durationMinutes) ? snapshot.durationMinutes : 30;
  const submissionMode = snapshot.submissionMode === "auto" ? "auto" : "manual";
  return {
    targetRole: job.title,
    jobDescription: formatPracticeJobContext(job),
    interviewer,
    difficulty,
    questionCount,
    durationMinutes,
    submissionMode
  };
}
function practiceJobFromSessionSnapshot(snapshot) {
  return {
    id: snapshot.id,
    source: snapshot.source,
    title: snapshot.title,
    companyName: snapshot.companyName,
    companyLogoUrl: snapshot.companyLogoUrl ?? "",
    location: snapshot.location,
    category: snapshot.category,
    employmentType: snapshot.employmentType,
    education: snapshot.education,
    experienceMin: snapshot.experienceMin,
    experienceMax: snapshot.experienceMax,
    salaryLabel: snapshot.salaryLabel,
    tags: snapshot.tags,
    summary: snapshot.summary,
    description: snapshot.description,
    responsibilities: snapshot.responsibilities,
    requirements: snapshot.requirements,
    isSynthetic: snapshot.isSynthetic,
    updatedAt: snapshot.updatedAt
  };
}
function parseSessionStartedAt(value) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}
function resolvePracticeRestorePhase(status, _finalizedTurnCount, _questionCount, _hasOpenTurn) {
  if (status === "finished") return "complete";
  if (status !== "interviewing") return "prepare";
  return "interview";
}
function beginPracticeAsyncRequest(generation2) {
  generation2.current += 1;
  return generation2.current;
}
function invalidatePracticeAsyncRequests(generation2) {
  generation2.current += 1;
}
function isPracticeAsyncRequestCurrent(generation2, requestGeneration) {
  return generation2.current === requestGeneration;
}
function canSendPracticeDiscoveryTurn(draft, hasAttachment, loading) {
  return !loading && (Boolean(draft.trim()) || hasAttachment);
}
function resolvePracticeDiscoveryUploadedJob(current, incoming) {
  return incoming ?? current ?? void 0;
}
function completeSkippedPracticeFlow(reset, onOpenPracticeHistory) {
  reset(true);
  onOpenPracticeHistory?.();
}
function canBeginPracticeInterview(devicesReady, resumeId, jobId) {
  return devicesReady && Boolean(resumeId?.trim()) && Boolean(jobId?.trim());
}
function acquirePracticeStartLock(lock) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}
function arePracticeDevicesReady(answerMode, microphoneStatus, cameraEnabled, cameraStatus, speakerStatus = "granted") {
  const microphoneReady = answerMode === "text" || microphoneStatus === "granted";
  const cameraReady = cameraEnabled ? cameraStatus === "granted" : cameraStatus === "skipped";
  const speakerReady = speakerStatus === "granted" || speakerStatus === "skipped";
  return microphoneReady && cameraReady && speakerReady;
}
function restorePracticeTurns(turns) {
  const ordered = [...turns].sort((left, right) => left.sequence - right.sequence);
  const exchanges = ordered.filter((turn) => turn.status === "finalized" && Boolean(turn.answer?.trim())).map((turn) => ({ question: turn.question, answer: turn.answer?.trim() ?? "" }));
  const openTurn = [...ordered].reverse().find((turn) => turn.status === "open");
  return {
    exchanges,
    currentQuestion: openTurn?.question ?? "",
    currentQuestionSequence: openTurn?.sequence ?? null
  };
}
function resolveFinishedPracticeRecovery(reportChoice, reportStatus, hasReportContent) {
  if (reportChoice === "skip") return "discard";
  if (reportChoice === "none") return "completion";
  if (reportStatus === "ready" && hasReportContent) return "report";
  return "completion";
}
function readActivePracticeSessionId() {
  try {
    return window.localStorage.getItem(ACTIVE_PRACTICE_SESSION_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}
function writeActivePracticeSessionId(sessionId2) {
  try {
    window.localStorage.setItem(ACTIVE_PRACTICE_SESSION_KEY, sessionId2);
  } catch {
  }
}
function clearActivePracticeSessionId() {
  try {
    window.localStorage.removeItem(ACTIVE_PRACTICE_SESSION_KEY);
  } catch {
  }
}
async function pollPracticeSessionReport(sessionId2, signal) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const session = await getPracticeSession(sessionId2, void 0, signal);
    if (session.report?.status === "ready" && session.report.content) return session.report.content;
    if (session.report?.status === "failed") throw new Error("复盘生成失败，请稍后重试");
    await abortableDelay(1e3, signal);
  }
  throw new Error("复盘仍在生成中，请稍后重试");
}
function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer2 = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      window.clearTimeout(timer2);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
function formatPracticeJobContext(job) {
  return [
    job.summary,
    job.description,
    job.responsibilities.length > 0 ? `岗位职责：
- ${job.responsibilities.join("\n- ")}` : "",
    job.requirements.length > 0 ? `任职要求：
- ${job.requirements.join("\n- ")}` : ""
  ].filter(Boolean).join("\n\n").slice(0, 6e3);
}
function stopVoiceCapture(asr, pcm, stream) {
  pcm?.stop();
  asr?.close();
  stream?.getTracks().forEach((track) => track.stop());
}
function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}
async function sampleMicrophoneLevel(stream, durationMs = 450) {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return 0;
  const context = new window.AudioContext();
  const source2 = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  source2.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  let peak = 0;
  const deadline = performance.now() + Math.max(100, durationMs);
  try {
    if (context.state === "suspended") await context.resume();
    while (performance.now() < deadline) {
      analyser.getByteTimeDomainData(samples);
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128);
      await new Promise((resolve) => window.setTimeout(resolve, 45));
    }
  } finally {
    source2.disconnect();
    analyser.disconnect();
    await context.close().catch(() => void 0);
  }
  return Math.min(100, Math.round(peak * 100));
}
function errorMessage(reason, fallback) {
  return reason instanceof Error && reason.message.trim() ? reason.message : fallback;
}
function practiceSpeechFallbackMessage(failure2, usingLocalFallback) {
  const reason = practiceSpeechFailureReason(failure2);
  const status = failure2.status === null ? "" : `，HTTP ${failure2.status}`;
  const retry = failure2.attempts > 1 ? "，已自动重试一次" : "";
  const action = usingLocalFallback === true ? "，已切换为本机语音。" : usingLocalFallback === "pending" ? "，正在尝试切换为本机语音。" : usingLocalFallback === "unavailable" ? "，本机语音尚未就绪，请点击“重播”重试。" : "，请点击“重播”重试。";
  return `${reason}（${failure2.code}${status}${retry}）${action}`;
}
function practiceSpeechFailureReason(failure2) {
  const reasonsByCode = {
    PRACTICE_SPEECH_AUTH_REQUIRED: "登录状态已失效",
    PRACTICE_SPEECH_AUTH_REFRESH_UNAVAILABLE: "登录状态暂时无法刷新",
    PRACTICE_SPEECH_SUBSCRIPTION_REQUIRED: "当前套餐暂不支持云端语音",
    PRACTICE_SPEECH_CLIENT_UPDATE_REQUIRED: "客户端版本需要更新",
    PRACTICE_SPEECH_NETWORK_ERROR: "未能连接云端语音服务"
  };
  const codeReason = reasonsByCode[failure2.code];
  if (codeReason) return codeReason;
  if (failure2.status === 404) return "云端未找到本轮面试问题";
  if (failure2.status === 429) return "云端语音请求繁忙";
  if (failure2.status === 503) return "云端语音服务暂时不可用";
  if (failure2.stage === "response") return "云端语音响应无效";
  if (failure2.stage === "audio-environment") return "当前环境无法播放云端音频";
  if (failure2.stage === "audio-construction") return "云端音频初始化失败";
  if (failure2.stage === "audio-play") return "云端音频起播失败";
  if (failure2.stage === "audio-media") return "云端音频解码或播放失败";
  return "云端语音请求失败";
}
function reportPracticeSpeechFailure(purpose, failure2, usingLocalFallback) {
  console.warn("[climb:practice-tts] cloud playback degraded", {
    purpose,
    stage: failure2.stage,
    code: failure2.code,
    status: failure2.status,
    attempts: failure2.attempts,
    localFallback: usingLocalFallback
  });
}
function practiceSpeechPreset(interviewer) {
  if (interviewer === "HR 面试官") return "hr";
  if (interviewer === "CEO 面试官") return "ceo";
  if (interviewer === "CTO 面试官" || interviewer === "技术面试官") return "cto";
  if (interviewer === "业务负责人" || interviewer === "业务面试官") return "business";
  return "manager";
}
function discoveryReplySuggestions(reply) {
  if (/(?:经验|年限|工作多久)/u.test(reply)) return ["应届", "1-3 年", "3-5 年", "5-10 年", "10 年以上"];
  if (/(?:薪资|待遇|预算)/u.test(reply)) return ["10-20K", "20-30K", "30-50K", "50K+", "面议"];
  if (/(?:城市|地点|地区|哪里)/u.test(reply)) return ["北京", "上海", "杭州", "深圳", "远程"];
  return ["技术研发", "产品与运营", "数据与算法", "根据我的简历推荐"];
}
function formatSessionTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
const PRACTICE_HISTORY_PAGE_SIZE = 50;
const PRACTICE_REPORT_POLL_INTERVAL_MS = 1500;
const PracticeHistoryHeader = ({ onBack, backLabel = "返回模拟面试", onRefresh, loading }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex flex-wrap items-start justify-between gap-4", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold tracking-[0.16em] text-blue-700", children: "演练记录" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-2 text-[27px] font-normal tracking-tight text-slate-950", children: "面试历史与复盘" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[12px] text-slate-500", children: "这里保存问题和最终文本回答，不保存音频或摄像头画面。" })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "no-drag flex flex-wrap items-center gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onBack, className: "inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] text-slate-600 transition hover:bg-slate-50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(s$a, { size: 15 }),
      backLabel
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onRefresh, disabled: loading, className: "inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] text-slate-600 transition hover:bg-slate-50 disabled:opacity-50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(m$3, { className: loading ? "animate-spin" : "", size: 15 }),
      "刷新"
    ] })
  ] })
] });
const PracticeHistoryPage = ({ onResume, initialSessionId, onBack, backLabel }) => {
  const [filter, setFilter] = reactExports.useState("all");
  const [items, setItems] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [loadingMore, setLoadingMore] = reactExports.useState(false);
  const [error2, setError] = reactExports.useState(null);
  const [loadMoreError, setLoadMoreError] = reactExports.useState(null);
  const [nextCursor, setNextCursor] = reactExports.useState(null);
  const [detail, setDetail] = reactExports.useState(null);
  const [detailLoading, setDetailLoading] = reactExports.useState(false);
  const [detailActionLoading, setDetailActionLoading] = reactExports.useState(false);
  const [detailActionError, setDetailActionError] = reactExports.useState(null);
  const [reloadKey, setReloadKey] = reactExports.useState(0);
  const listGenerationRef = reactExports.useRef(0);
  const loadMoreLockRef = reactExports.useRef(null);
  const detailLoadGenerationRef = reactExports.useRef(0);
  const detailLoadControllerRef = reactExports.useRef(null);
  const detailPollControllerRef = reactExports.useRef(null);
  const detailActionGenerationRef = reactExports.useRef(0);
  const initialDetailOpenedRef = reactExports.useRef("");
  reactExports.useEffect(() => {
    let cancelled = false;
    const generation2 = ++listGenerationRef.current;
    loadMoreLockRef.current = null;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);
    setNextCursor(null);
    setItems([]);
    void listPracticeSessions({
      status: filter === "all" ? void 0 : filter,
      limit: PRACTICE_HISTORY_PAGE_SIZE
    }).then((result) => {
      if (!cancelled && generation2 === listGenerationRef.current) {
        setItems(mergePracticeHistoryItems([], result.items));
        setNextCursor(result.nextCursor);
      }
    }).catch((reason) => {
      if (!cancelled && generation2 === listGenerationRef.current) {
        setError(reason instanceof Error ? reason.message : "加载面试记录失败");
      }
    }).finally(() => {
      if (!cancelled && generation2 === listGenerationRef.current) setLoading(false);
    });
    return () => {
      cancelled = true;
      if (listGenerationRef.current === generation2) {
        listGenerationRef.current += 1;
        loadMoreLockRef.current = null;
      }
    };
  }, [filter, reloadKey]);
  const loadMore = async () => {
    const cursor = nextCursor;
    if (!cursor || loading) return;
    const token = acquirePracticeHistoryLoadLock(loadMoreLockRef);
    if (!token) return;
    const generation2 = listGenerationRef.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await listPracticeSessions({
        status: filter === "all" ? void 0 : filter,
        limit: PRACTICE_HISTORY_PAGE_SIZE,
        cursor
      });
      if (generation2 !== listGenerationRef.current || loadMoreLockRef.current !== token) return;
      setItems((current) => mergePracticeHistoryItems(current, result.items));
      setNextCursor(result.nextCursor);
    } catch (reason) {
      if (generation2 === listGenerationRef.current && loadMoreLockRef.current === token) {
        setLoadMoreError(reason instanceof Error ? reason.message : "加载更多面试记录失败");
      }
    } finally {
      if (releasePracticeHistoryLoadLock(loadMoreLockRef, token)) setLoadingMore(false);
    }
  };
  const openDetail = async (sessionId2) => {
    const generation2 = ++detailLoadGenerationRef.current;
    detailLoadControllerRef.current?.abort();
    const controller = new AbortController();
    detailLoadControllerRef.current = controller;
    setDetailLoading(true);
    setError(null);
    setDetailActionError(null);
    try {
      const session = await getPracticeSession(sessionId2, void 0, controller.signal);
      if (generation2 !== detailLoadGenerationRef.current || controller.signal.aborted) return;
      setDetail(session);
      setItems((current) => updatePracticeHistorySessionSummary(current, session));
    } catch (reason) {
      if (generation2 === detailLoadGenerationRef.current && !controller.signal.aborted) {
        const message = reason instanceof Error ? reason.message : "加载面试详情失败";
        setDetailActionError(message);
        setError(message);
      }
    } finally {
      if (generation2 === detailLoadGenerationRef.current) {
        detailLoadControllerRef.current = null;
        setDetailLoading(false);
      }
    }
  };
  const closeDetail = () => {
    detailLoadGenerationRef.current += 1;
    detailActionGenerationRef.current += 1;
    detailLoadControllerRef.current?.abort();
    detailLoadControllerRef.current = null;
    detailPollControllerRef.current?.abort();
    detailPollControllerRef.current = null;
    setDetail(null);
    setDetailLoading(false);
    setDetailActionLoading(false);
    setDetailActionError(null);
  };
  const generateOrRetryReport = async () => {
    const session = detail;
    if (!session || session.status !== "finished" || detailActionLoading) return;
    const generation2 = ++detailActionGenerationRef.current;
    setDetailActionLoading(true);
    setDetailActionError(null);
    try {
      const result = await requestPracticeSessionReport(session.id);
      if (generation2 !== detailActionGenerationRef.current) return;
      setDetail(result.session);
      setItems((current) => updatePracticeHistorySessionSummary(current, result.session));
    } catch (reason) {
      if (generation2 === detailActionGenerationRef.current) {
        setDetailActionError(reason instanceof Error ? reason.message : "启动复盘生成失败");
      }
    } finally {
      if (generation2 === detailActionGenerationRef.current) setDetailActionLoading(false);
    }
  };
  const skipReport = async () => {
    const session = detail;
    if (!session || session.status !== "finished" || session.reportChoice !== "none" || detailActionLoading) return;
    const generation2 = ++detailActionGenerationRef.current;
    setDetailActionLoading(true);
    setDetailActionError(null);
    try {
      const updated = await finishPracticeSession(session.id, "skip");
      if (generation2 !== detailActionGenerationRef.current) return;
      setDetail(updated);
      setItems((current) => updatePracticeHistorySessionSummary(current, updated));
    } catch (reason) {
      if (generation2 === detailActionGenerationRef.current) {
        setDetailActionError(reason instanceof Error ? reason.message : "保存复盘选择失败");
      }
    } finally {
      if (generation2 === detailActionGenerationRef.current) setDetailActionLoading(false);
    }
  };
  reactExports.useEffect(() => {
    const sessionId2 = initialSessionId?.trim() ?? "";
    if (!sessionId2 || initialDetailOpenedRef.current === sessionId2) return;
    initialDetailOpenedRef.current = sessionId2;
    void openDetail(sessionId2);
  }, [initialSessionId]);
  reactExports.useEffect(() => {
    if (!detail || detail.report?.status !== "generating") return;
    const sessionId2 = detail.id;
    const controller = new AbortController();
    detailPollControllerRef.current?.abort();
    detailPollControllerRef.current = controller;
    void (async () => {
      try {
        while (!controller.signal.aborted) {
          await practiceHistoryAbortableDelay(PRACTICE_REPORT_POLL_INTERVAL_MS, controller.signal);
          const refreshed = await getPracticeSession(sessionId2, void 0, controller.signal);
          if (controller.signal.aborted) return;
          setDetail(refreshed);
          setItems((current) => updatePracticeHistorySessionSummary(current, refreshed));
          if (refreshed.report?.status !== "generating") return;
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setDetailActionError(reason instanceof Error ? reason.message : "刷新复盘进度失败");
        }
      }
    })();
    return () => {
      controller.abort();
      if (detailPollControllerRef.current === controller) detailPollControllerRef.current = null;
    };
  }, [detail?.id, detail?.report?.status]);
  reactExports.useEffect(() => () => {
    detailLoadGenerationRef.current += 1;
    detailActionGenerationRef.current += 1;
    detailLoadControllerRef.current?.abort();
    detailPollControllerRef.current?.abort();
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-full min-w-0 overflow-y-auto bg-[#fbfbfa] px-5 py-7 sm:px-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto w-full max-w-[1120px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeHistoryHeader, { onBack, backLabel, onRefresh: () => setReloadKey((value) => value + 1), loading }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-7 flex flex-wrap gap-2", role: "tablist", "aria-label": "筛选面试记录", children: HISTORY_FILTERS.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", role: "tab", "aria-selected": filter === item.value, onClick: () => setFilter(item.value), className: `h-9 rounded-full px-4 text-[11px] font-medium transition ${filter === item.value ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`, children: item.label }, item.value)) }),
      error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "alert", className: "mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700", children: error2 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "mt-5 min-w-0", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-[260px] items-center justify-center gap-2 text-[12px] text-slate-500", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 18 }),
        "正在加载面试记录…"
      ] }) : items.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-[22px] border border-dashed border-slate-200 bg-white px-5 py-16 text-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(s$3, { className: "mx-auto text-slate-300", size: 34 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 text-[13px] text-slate-600", children: "当前筛选下还没有面试记录" })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3", children: items.map((session) => {
          const primaryAction = practiceHistoryPrimaryAction(session);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "flex min-w-0 flex-col rounded-[20px] border border-slate-200 bg-white p-5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "line-clamp-2 break-words text-[15px] font-semibold leading-6 text-slate-950", children: session.jobSnapshot.title }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 truncate text-[11px] text-slate-500", children: [practiceHistoryCardCompanyName(session.jobSnapshot.companyName), session.jobSnapshot.location].filter(Boolean).join(" · ") || "公司信息未标注" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: session.status })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-5 grid grid-cols-2 gap-3 text-[10px]", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryInfo, { label: "面试官", value: interviewerLabel(session.configSnapshot.interviewer) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryInfo, { label: "难度", value: difficultyLabel(session.configSnapshot.difficulty) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryInfo, { label: "实际轮次", value: practiceHistoryRoundLabel(session.completedTurnCount) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryInfo, { label: "预计时长", value: `${session.configSnapshot.durationMinutes} 分钟` }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryInfo, { label: "提交方式", value: session.configSnapshot.submissionMode === "auto" ? "自动判断" : "手动确认" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryInfo, { label: "时间", value: formatHistoryDate(session.createdAt) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex items-center gap-2 border-t border-slate-100 pt-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => primaryAction.kind === "resume" ? onResume(session.id) : void openDetail(session.id),
                  className: "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 text-[11px] font-semibold text-white transition hover:bg-slate-800",
                  children: [
                    primaryAction.kind === "resume" ? /* @__PURE__ */ jsxRuntimeExports.jsx(n$3, { size: 13, weight: "fill" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(s$3, { size: 13 }),
                    primaryAction.label
                  ]
                }
              ),
              primaryAction.kind === "resume" && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => void openDetail(session.id), className: "inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50", children: [
                "查看详情",
                /* @__PURE__ */ jsxRuntimeExports.jsx(s$7, { size: 13 })
              ] })
            ] })
          ] }, session.id);
        }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          PracticeHistoryPagination,
          {
            hasMore: Boolean(nextCursor),
            loading: loadingMore,
            error: loadMoreError,
            onLoadMore: () => void loadMore()
          }
        )
      ] }) })
    ] }),
    (detail || detailLoading) && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PracticeHistoryDialog,
      {
        session: detail,
        loading: detailLoading,
        actionLoading: detailActionLoading,
        actionError: detailActionError,
        onClose: closeDetail,
        onResume,
        onGenerateReport: () => void generateOrRetryReport(),
        onSkipReport: () => void skipReport()
      }
    )
  ] });
};
const PracticeHistoryPagination = ({ hasMore, loading, error: error2, onLoadMore }) => {
  if (!hasMore && !error2) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex flex-col items-center gap-3", children: [
    error2 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "alert", className: "w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-[11px] text-red-700", children: error2 }),
    hasMore && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onLoadMore, disabled: loading, className: "inline-flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60", children: [
      loading && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 15 }),
      loading ? "正在加载…" : error2 ? "重试加载" : "加载更多"
    ] })
  ] });
};
function mergePracticeHistoryItems(current, incoming) {
  const itemsById = /* @__PURE__ */ new Map();
  current.forEach((item) => itemsById.set(item.id, item));
  incoming.forEach((item) => itemsById.set(item.id, item));
  return [...itemsById.values()];
}
function updatePracticeHistorySessionSummary(current, session) {
  const { turns: _turns, report, ...summary } = session;
  const reportSummary = report ? {
    status: report.status,
    attempts: report.attempts,
    errorCode: report.errorCode,
    generatedAt: report.generatedAt,
    updatedAt: report.updatedAt
  } : null;
  return current.map((item) => item.id === session.id ? { ...summary, reportSummary } : item);
}
function practiceHistoryPrimaryAction(session) {
  if (session.status !== "finished") return { kind: "resume", label: "继续演练" };
  const reportStatus = session.report?.status ?? session.reportSummary?.status;
  return {
    kind: "detail",
    label: reportStatus === "generating" ? "查看复盘进度" : practiceHistoryResumeLabel(session) ?? "查看面试详情"
  };
}
function practiceHistoryCardCompanyName(value) {
  return (value ?? "").replace(/\s*[（(]\s*(?:模拟岗位|模拟\s*JD)\s*[）)]\s*$/u, "").trim();
}
function acquirePracticeHistoryLoadLock(lock) {
  if (lock.current) return null;
  const token = Symbol("practice-history-load");
  lock.current = token;
  return token;
}
function releasePracticeHistoryLoadLock(lock, token) {
  if (lock.current !== token) return false;
  lock.current = null;
  return true;
}
const PracticeHistoryDialog = ({
  session,
  loading,
  actionLoading,
  actionError,
  onClose,
  onResume,
  onGenerateReport,
  onSkipReport
}) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 sm:p-6", onMouseDown: (event) => {
  if (event.target === event.currentTarget) onClose();
}, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { role: "dialog", "aria-modal": "true", "aria-labelledby": "practice-history-dialog-title", className: "flex max-h-[92vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "practice-history-dialog-title", className: "truncate text-[20px] font-semibold text-slate-950", children: session?.jobSnapshot.title || "面试详情" }),
      session && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-[11px] text-slate-500", children: [
        formatHistoryDate(session.createdAt),
        " · ",
        interviewerLabel(session.configSnapshot.interviewer),
        " · ",
        difficultyLabel(session.configSnapshot.difficulty)
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", "aria-label": "关闭面试详情", onClick: onClose, className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx(n, { size: 19 }) })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-0 flex-1 overflow-y-auto px-6 py-5", children: loading || !session ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-[260px] items-center justify-center gap-2 text-[12px] text-slate-500", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 18 }),
    "正在加载详情…"
  ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[13px] font-semibold text-slate-900", children: "问答记录" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-slate-500", children: [
          "实际完成 ",
          countFinalizedPracticeTurns(session.turns),
          " 轮"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 space-y-3", children: session.turns.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-slate-400", children: "尚未产生问答。" }) : session.turns.map((turn) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-slate-200 px-4 py-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] font-semibold text-blue-700", children: [
          "第 ",
          turn.sequence,
          " 题"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 whitespace-pre-wrap break-words text-[12px] leading-6 text-slate-700", children: turn.question }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "my-3 h-px bg-slate-100" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "whitespace-pre-wrap text-[12px] leading-6 text-slate-600", children: turn.answer || "本题尚未提交回答" })
      ] }, turn.id)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[13px] font-semibold text-slate-900", children: "复盘报告" }),
      actionError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "alert", className: "mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] text-red-700", children: actionError }),
      session.report?.status === "ready" && session.report.content ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-2xl bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[24px] font-semibold text-slate-950", children: [
          session.report.content.overallScore,
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-[11px] font-normal text-slate-400", children: "/ 100" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[12px] leading-6 text-slate-600", children: session.report.content.summary }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 grid gap-3 sm:grid-cols-2", children: session.report.content.dimensions.map((dimension, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-slate-200 bg-white p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-800", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: dimension.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: dimension.score })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] leading-5 text-slate-500", children: dimension.feedback })
        ] }, `${dimension.name}-${index2}`)) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeReportList, { title: "优势", items: session.report.content.strengths }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeReportList, { title: "改进方向", items: session.report.content.improvements }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PracticeReportList, { title: "下一步练习", items: session.report.content.nextActions })
      ] }) : session.reportChoice === "none" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] leading-6 text-slate-600", children: "本场尚未选择是否生成复盘。生成后可关闭窗口，报告会继续在服务端后台完成。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onGenerateReport, disabled: actionLoading, className: "inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-4 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400", children: [
            actionLoading && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 14 }),
            "生成复盘报告"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onSkipReport, disabled: actionLoading, className: "h-9 rounded-xl border border-slate-200 bg-white px-4 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50", children: "暂不生成" })
        ] })
      ] }) : session.report?.status === "generating" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-[12px] text-blue-700", role: "status", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 16 }),
        "复盘正在后台生成；关闭此窗口不会中断任务，完成后会在这里自动显示。"
      ] }) : session.report?.status === "failed" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-2xl border border-red-100 bg-red-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] leading-6 text-red-700", children: "上次复盘生成失败，可以从已保存的本场问答重新生成，无需重新面试。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onGenerateReport, disabled: actionLoading, className: "mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-4 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-400", children: [
          actionLoading && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 14 }),
          "重新生成复盘"
        ] })
      ] }) : session.reportChoice === "generate" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] leading-6 text-amber-800", children: "已选择生成复盘，但任务尚未启动或状态暂不可用。可以继续启动，不会重复创建报告。" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: onGenerateReport, disabled: actionLoading, className: "mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-4 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-400", children: [
          actionLoading && /* @__PURE__ */ jsxRuntimeExports.jsx(s$4, { className: "animate-spin", size: 14 }),
          "继续生成复盘"
        ] })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[12px] text-slate-500", children: "本场选择了不生成复盘。" })
    ] })
  ] }) }),
  session && session.status !== "finished" && /* @__PURE__ */ jsxRuntimeExports.jsx("footer", { className: "flex justify-end border-t border-slate-200 px-6 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => onResume(session.id), className: "inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-5 text-[12px] font-semibold text-white", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(n$3, { size: 14, weight: "fill" }),
    "继续演练"
  ] }) }),
  session && session.status === "finished" && /* @__PURE__ */ jsxRuntimeExports.jsx("footer", { className: "flex justify-end border-t border-slate-200 px-6 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, className: "h-10 rounded-xl border border-slate-200 bg-white px-5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50", children: "返回面试记录" }) })
] }) });
const HISTORY_FILTERS = [
  { label: "全部", value: "all" },
  { label: "进行中", value: "interviewing" },
  { label: "准备中", value: "preparing" },
  { label: "已完成", value: "finished" }
];
const HistoryInfo = ({ label, value }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "text-slate-400", children: label }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "mt-1 truncate font-medium text-slate-700", children: value })
] });
const PracticeReportList = ({ title, items }) => items.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-4", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-[11px] font-semibold text-slate-800", children: title }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1.5 text-[11px] leading-5 text-slate-600", children: items.map((item, index2) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "•" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: item })
  ] }, `${title}-${index2}`)) })
] }) : null;
function practiceHistoryResumeLabel(session) {
  if (session.status !== "finished") return "继续演练";
  if (session.reportChoice === "skip") return null;
  if (session.reportChoice === "none") return "选择是否生成复盘";
  const reportStatus = session.report?.status ?? session.reportSummary?.status;
  if (reportStatus === "ready") return "查看完整复盘";
  if (reportStatus === "failed") return "重新生成复盘";
  if (reportStatus === "generating") return "继续等待复盘";
  return "查看复盘进度";
}
function countFinalizedPracticeTurns(turns) {
  return turns.filter((turn) => turn.status === "finalized").length;
}
function practiceHistoryRoundLabel(completedTurnCount) {
  return completedTurnCount === void 0 ? "详情中查看" : `${completedTurnCount} 轮`;
}
const StatusBadge = ({ status }) => {
  const value = status === "finished" ? ["已完成", "bg-emerald-50 text-emerald-700"] : status === "interviewing" ? ["进行中", "bg-blue-50 text-blue-700"] : status === "preparing" ? ["准备中", "bg-amber-50 text-amber-700"] : ["草稿", "bg-slate-100 text-slate-600"];
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${value[1]}`, children: value[0] });
};
function interviewerLabel(value) {
  if (value === "hr") return "HR 面试官";
  if (value === "ceo") return "CEO 面试官";
  if (value === "cto" || value === "technical") return "CTO 面试官";
  if (value === "business") return "业务负责人";
  return "直属上级";
}
function difficultyLabel(value) {
  return value === "stress" ? "压力面" : "正常面";
}
function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}
function practiceHistoryAbortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer2 = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      window.clearTimeout(timer2);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export { RESUME_ACCEPT, JD_ACCEPT, MAX_JD_ATTACHMENT_BYTES, DIFFICULTIES, INTERVIEWERS, QUESTION_COUNTS, DURATION_MINUTES, HOME_PROMPTS, ACTIVE_PRACTICE_SESSION_KEY, PRACTICE_SESSION_RESTORE_TIMEOUT_MS, PRACTICE_JOB_SEARCH_DEBOUNCE_MS, DEFAULT_CONFIG, EXPERIENCE_FILTERS, EMPLOYMENT_TYPE_FILTERS, EDUCATION_FILTERS, SALARY_FILTERS, PracticeInterviewPage, PracticeDiscoveryView, PendingJdAttachment, PracticeHeader, PracticeJobCard, practiceCardCompanyName, isSyntheticCardLabel, CompanyLogo, PracticeResumePreviewDialog, ResumePreviewSection, ResumePreviewItem, PracticeJdPreviewDialog, JdEditorField, JdEditorTextArea, PracticeFilterSelect, PracticeConfirmDialog, parseLinesToList, PracticeCustomJobFormDialog, PracticeJobDialog, JobDetailList, PracticePreparationView, DeviceStatusRow, PracticeCompletionView, SegmentField, PracticeSessionView, RoomControlButton, PracticeReportView, ReportList, InfoRow, InlineError, formatExperience, formatAttachmentBytes, isPracticeJobSalaryBand, sortPracticeJobsByTitle, practiceJobTitleCollator, comparePracticeJobTitleText, comparePracticeJobCompanyText, normalizePracticeJobSortText, practiceJobTitleCharacterGroup, comparePracticeJobOrdinalText, isTrustedCompanyLogoUrl, splitEditorLines, replaceArrayItem, splitEditorTags, nullableEditorNumber, practiceConfigToSessionSnapshot, practiceConfigFromSessionSnapshot, practiceJobFromSessionSnapshot, parseSessionStartedAt, resolvePracticeRestorePhase, beginPracticeAsyncRequest, invalidatePracticeAsyncRequests, isPracticeAsyncRequestCurrent, canSendPracticeDiscoveryTurn, resolvePracticeDiscoveryUploadedJob, completeSkippedPracticeFlow, canBeginPracticeInterview, acquirePracticeStartLock, arePracticeDevicesReady, restorePracticeTurns, resolveFinishedPracticeRecovery, readActivePracticeSessionId, writeActivePracticeSessionId, clearActivePracticeSessionId, pollPracticeSessionReport, abortableDelay, formatPracticeJobContext, stopVoiceCapture, stopMediaStream, sampleMicrophoneLevel, errorMessage, practiceSpeechFallbackMessage, practiceSpeechFailureReason, reportPracticeSpeechFailure, practiceSpeechPreset, discoveryReplySuggestions, formatSessionTime, PRACTICE_HISTORY_PAGE_SIZE, PRACTICE_REPORT_POLL_INTERVAL_MS, PracticeHistoryHeader, PracticeHistoryPage, PracticeHistoryPagination, mergePracticeHistoryItems, updatePracticeHistorySessionSummary, practiceHistoryPrimaryAction, practiceHistoryCardCompanyName, acquirePracticeHistoryLoadLock, releasePracticeHistoryLoadLock, PracticeHistoryDialog, HISTORY_FILTERS, HistoryInfo, PracticeReportList, practiceHistoryResumeLabel, countFinalizedPracticeTurns, practiceHistoryRoundLabel, StatusBadge, interviewerLabel, difficultyLabel, formatHistoryDate, practiceHistoryAbortableDelay };
