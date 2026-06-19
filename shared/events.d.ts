export const SocketEvents: {
  CREATE_ROOM: "create-room";
  ROOM_CREATED: "room-created";
  ROOM_EXISTS: "room-exists";
  JOIN_ROOM: "join-room";
  REJOIN_ROOM: "rejoin-room";
  ROOM_READY: "room-ready";
  ROOM_ERROR: "room-error";
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
  TAB_SWITCH: "tab_switch";
  LARGE_PASTE: "large_paste";
  SUBMISSION_SPAM: "submission_spam";
};

export const SUPPORTED_LANGUAGES: ["python", "javascript", "cpp", "java"];
