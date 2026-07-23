export const SocketEvents: {
  CREATE_ROOM: "create-room";
  ROOM_CREATED: "room-created";
  ROOM_EXISTS: "room-exists";
  START_SOLO: "start-solo";
  JOIN_ROOM: "join-room";
  REJOIN_ROOM: "rejoin-room";
  ROOM_READY: "room-ready";
  ROOM_ERROR: "room-error";
  SESSION_READY: "session-ready";
  GET_PROBLEM: "get-problem";
  PROBLEM: "problem";
  CODE_UPDATE: "code-update";
  SUBMIT_CODE: "submit-code";
  SUBMISSION_RESULT: "submission-result";
  LEADERBOARD_UPDATE: "leaderboard-update";
  GET_REPLAY: "get-replay";
  REPLAY_DATA: "replay-data";
  ANTI_CHEAT_EVENT: "anti-cheat-event";
  ANTI_CHEAT_WARNING: "anti-cheat-warning";
  GET_ANTI_CHEAT_SUMMARY: "get-anti-cheat-summary";
  ANTI_CHEAT_SUMMARY: "anti-cheat-summary";
};

export const AntiCheatEventTypes: {
  FOCUS_LOST: "focus_lost";
  FOCUS_GAINED: "focus_gained";
  FOCUS_CHECK: "focus_check";
  TAB_SWITCH: "tab_switch";
  PASTE: "paste";
  LARGE_PASTE: "large_paste";
  DROP_INSERT: "drop_insert";
  SUBMISSION_ATTEMPT: "submission_attempt";
  SUBMISSION_SPAM: "submission_spam";
};

export const SUPPORTED_LANGUAGES: ["python", "javascript", "cpp", "java"];
