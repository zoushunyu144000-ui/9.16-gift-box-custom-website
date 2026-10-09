/** Rejects when `promise` takes longer than `ms`, so a slow outside service can't hold up checkout. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
