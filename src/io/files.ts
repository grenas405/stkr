// Saving files to the device, and asking the browser to protect stored data.

export const saveFile = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

// Without this a browser may evict site data when the device runs low on space.
export const requestPersistentStorage = async (): Promise<boolean> =>
  navigator.storage?.persist ? navigator.storage.persist() : false;

export const isStoragePersistent = async (): Promise<boolean> =>
  navigator.storage?.persisted ? navigator.storage.persisted() : false;
