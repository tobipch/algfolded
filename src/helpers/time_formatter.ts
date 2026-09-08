// ms - total milliseconds
export const msToHumanReadable = (ms: number, numDigitsMs = 2, displayMs = true): string => {
  if (!Number.isFinite(ms) || ms < 0) {
    ms = 0
  }

  const msDivider = Math.pow(10, 3 - numDigitsMs);
  const milliseconds = Math.floor(ms % 1000 / msDivider);
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;

  const pad = (num: number): string => (num < 10 ? "0" : "") + num;
  const padMs = (num: number): string => `${num}`.padStart(numDigitsMs, "0")

  const hoursString = hours === 0 ? "" : hours + ":";
  const minutesString = minutes === 0 ? "" : (hours === 0 ? minutes : pad(minutes)) + ":";
  const secondsString = (ms >= 1000 * 60) ? pad(seconds) : seconds;
  const millisecondsString = displayMs ? `.${padMs(milliseconds)}` : "";

  return `${hoursString}${minutesString}${secondsString}${millisecondsString}`;
}

// A wall clock for a whole session. Units that are zero are left off, so under
// a minute it reads "34.14" rather than "0:34.14"; a minute in, "1:02.45".
// `hundredths` appends the fraction where the exact total matters.
export const msToClock = (ms: number, hundredths = false): string => {
  if (!Number.isFinite(ms) || ms < 0) {
    ms = 0
  }
  const total = Math.floor(ms / 1000)
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  const pad = (num: number): string => (num < 10 ? "0" : "") + num
  const fraction = hundredths ? `.${pad(Math.floor((ms % 1000) / 10))}` : ""
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}${fraction}`
  if (minutes > 0) return `${minutes}:${pad(seconds)}${fraction}`
  return `${seconds}${fraction}`
}
