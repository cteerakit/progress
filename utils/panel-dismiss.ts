export type DismissiblePanel = {
  roots: Element[];
  close: () => void;
};

let activePanels: DismissiblePanel[] = [];
let listenerAttached = false;

function isEventInsideRoots(event: Event, roots: Element[]): boolean {
  const path = event.composedPath();
  return roots.some((root) => path.includes(root));
}

function attachGlobalDismissListener(): void {
  if (listenerAttached) {
    return;
  }

  listenerAttached = true;
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (activePanels.length === 0) {
        return;
      }

      const remaining: DismissiblePanel[] = [];
      for (const panel of activePanels) {
        if (isEventInsideRoots(event, panel.roots)) {
          remaining.push(panel);
        } else {
          panel.close();
        }
      }
      activePanels = remaining;
    },
    true,
  );
}

export function registerDismissiblePanel(panel: DismissiblePanel): void {
  attachGlobalDismissListener();

  for (const other of activePanels) {
    if (other !== panel) {
      other.close();
    }
  }

  activePanels = activePanels.filter((entry) => entry === panel);
  if (!activePanels.includes(panel)) {
    activePanels.push(panel);
  }
}

export function unregisterDismissiblePanel(panel: DismissiblePanel): void {
  activePanels = activePanels.filter((entry) => entry !== panel);
}
