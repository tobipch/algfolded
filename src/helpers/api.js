// Small fetch wrapper for the Algfolded API (Vercel functions under /api).
// Sends/receives JSON and includes the session cookie.
export class ApiError extends Error {
    constructor(status, path) {
        super(`API ${path} failed with status ${status}`)
        this.status = status
    }
}

export const apiFetch = async (path, options = {}) => {
    const {body, headers, ...rest} = options
    const res = await fetch(path, {
        credentials: 'same-origin',
        headers: {
            ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
            ...(headers || {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        ...rest,
    })
    if (!res.ok) throw new ApiError(res.status, path)
    const contentType = res.headers.get('content-type') || ''
    return contentType.includes('application/json') ? res.json() : null
}
