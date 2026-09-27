import { NextResponse, type NextRequest } from 'next/server'

const isVerifiedLoopsHost = (host: string): boolean => {
  const h = host.toLowerCase().split(':')[0]
  return h === 'verifiedloops.com' || h === 'www.verifiedloops.com'
}

export const middleware = (req: NextRequest) => {
  const host = req.headers.get('host') ?? ''
  const { pathname } = req.nextUrl
  const onVlHost = isVerifiedLoopsHost(host)
  const onVlPath = pathname === '/vl' || pathname.startsWith('/vl/')

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-site', onVlHost || onVlPath ? 'vl' : 'arman')

  if (onVlHost && !onVlPath) {
    const url = req.nextUrl.clone()
    url.pathname = pathname === '/' ? '/vl' : `/vl${pathname}`
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
