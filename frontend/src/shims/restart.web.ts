/** Web stand-in for `react-native-restart` — a full page reload. */
const RNRestart = {
  restart: () => {
    if (typeof window !== 'undefined') window.location.reload();
  },
  Restart: () => {
    if (typeof window !== 'undefined') window.location.reload();
  },
};

export default RNRestart;
