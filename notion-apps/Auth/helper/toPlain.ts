function toPlain(arr?: any[]): string {
    return (arr ?? []).map(t => t.plain_text ?? '').join('');

}

export {
    toPlain,
};