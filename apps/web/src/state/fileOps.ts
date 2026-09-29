/** Whole-model operations: new, open JSON (migrated + validated, errors shown inline), save JSON, examples. */
import { createEmptyModel, migrateModel, type Model } from '@looplab/core';
import { download, fileStem } from '../lib/files.ts';
import { withLayout } from '../lib/prepare.ts';
import { loadModel } from './actions.ts';
import { stamp } from './persistence.ts';
import { useRunsStore } from './runs.ts';
import { useModelStore } from './store.ts';
import { useUiStore } from './ui.ts';

function replaceModel(model: Model): void {
  useUiStore.getState().setFileError(null);
  useRunsStore.getState().clear();
  loadModel(withLayout(model));
}

export function newModel(): void {
  replaceModel(createEmptyModel('Untitled model'));
  useUiStore.getState().setStage('frame');
}

/** Parse, migrate and open a model file. Invalid files change nothing and show an inline error banner. */
export function openModelText(text: string, fileName: string): boolean {
  const ui = useUiStore.getState();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    ui.setFileError({ message: `${fileName} is not valid JSON.`, issues: [] });
    return false;
  }
  const r = migrateModel(json);
  if (!r.ok) {
    ui.setFileError({ message: `${fileName}: ${r.error}`, issues: r.issues.slice(0, 8) });
    return false;
  }
  replaceModel(r.model);
  ui.toast(`Opened “${r.model.name}”${r.warnings.length ? ` (${r.warnings.join(' ')})` : ''}`, 'success');
  return true;
}

export async function openModelFile(file: File): Promise<boolean> {
  return openModelText(await file.text(), file.name);
}

export function saveModelFile(): void {
  const model = useModelStore.getState().model;
  download(`${fileStem(model.name)}.looplab.json`, JSON.stringify(stamp(model), null, 2), 'application/json');
}

export function openExample(model: Model, title: string): void {
  replaceModel(model);
  useUiStore.getState().setStage('map');
  useUiStore.getState().toast(`Opened example “${title}”`, 'success');
}
