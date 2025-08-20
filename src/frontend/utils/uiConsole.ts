type ConsoleEntry = { text: string; time: string };
let listeners: ((entry: ConsoleEntry) => void)[] = [];

export function uiConsole(text: string) {
  const time = new Date().toLocaleTimeString();
  const entry = { text, time };
  listeners.forEach((fn) => fn(entry));
  console.log(text); // optional: echtes Log in DevTools
}

export function subscribeToConsole(fn: (entry: ConsoleEntry) => void) {
  listeners.push(fn);
}

export function unsubscribeFromConsole(fn: (entry: ConsoleEntry) => void) {
  listeners = listeners.filter((f) => f !== fn);
}

//import uiConsole and then uiConsole("What we want to log in ui console")