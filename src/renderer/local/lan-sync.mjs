// 知跃 · Developed by gulinyue.
import { React } from '../vendor/react-icons-state.mjs';
export function useLanAnswer({ conversation, mode, busy = false, capturing = false, error = '', active = true }) {
  const [revision, refresh] = React.useReducer(value => value + 1, 0);
  const latest = React.useRef(null), timer = React.useRef(null);
  latest.current = active ? { conversationId: conversation.id, title: conversation.title, mode: mode || conversation.mode, messages: conversation.messages, busy, capturing, error } : null;
  React.useEffect(() => window.api.lan.onStatus(() => refresh()), []);
  React.useEffect(() => () => { clearTimeout(timer.current);if (latest.current) void window.api.lan.publish({ ...latest.current, busy: false, capturing: false }).catch(() => {}); }, []);
  React.useEffect(() => {
    if (!active || timer.current) return;
    timer.current = setTimeout(() => { timer.current = null;if (latest.current) void window.api.lan.publish(latest.current).catch(() => {}); }, 70);
  }, [conversation, busy, capturing, error, active, mode, revision]);
}
