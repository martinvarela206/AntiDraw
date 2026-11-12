/**
 * AntiDraw AtomicFileWriter
 * 
 * Escritura atómica a disco para evitar archivos corruptos o a medio escribir
 * ante fallos imprevistos, cortes de energía o excepciones del proceso.
 * 
 * Escribe primero en un archivo temporal con sufijo único y realiza
 * el reemplazo atómico mediante `rename(tempUri, targetUri, { overwrite: true })`.
 */

export interface IFileSystemBridge {
  writeFile: (uri: any, content: Uint8Array) => Thenable<void> | Promise<void>;
  rename: (source: any, target: any, options: { overwrite: boolean }) => Thenable<void> | Promise<void>;
  delete: (uri: any, options?: { recursive?: boolean; useTrash?: boolean }) => Thenable<void> | Promise<void>;
}

export class AtomicFileWriter {
  /**
   * Escribe el contenido en `targetUri` de forma estrictamente atómica.
   *
   * @param fs Objeto de sistema de archivos (ej. vscode.workspace.fs).
   * @param targetUri URI de destino final.
   * @param content Búfer de bytes a escribir.
   */
  public static async write(
    fs: IFileSystemBridge,
    targetUri: any,
    content: Uint8Array
  ): Promise<void> {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const tempPath = `${targetUri.path}.tmp.${Date.now()}_${randomSuffix}`;
    const tempUri = typeof targetUri.with === 'function'
      ? targetUri.with({ path: tempPath })
      : { ...targetUri, path: tempPath, fsPath: `${targetUri.fsPath || targetUri.path}.tmp.${Date.now()}_${randomSuffix}` };

    try {
      await fs.writeFile(tempUri, content);
      await fs.rename(tempUri, targetUri, { overwrite: true });
    } catch (err) {
      try {
        await fs.delete(tempUri, { useTrash: false });
      } catch {
        // Ignorar fallos de limpieza del archivo temporal
      }
      throw err;
    }
  }
}
