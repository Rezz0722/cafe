/** JSON داخل script باید `<` را escape کند تا `</script>` داده، تگ را نبندد. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
