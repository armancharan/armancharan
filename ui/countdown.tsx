import { useEffect, useState } from 'react'

const SECOND = 1000
const MINUTE = SECOND * 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24

export const Countdown: React.ComponentType<{ endDate: Date }> = props => {
  const [now, setNow] = useState<Date | undefined>(undefined)

  const timeRemaining = now ? props.endDate.getTime() - now.getTime() : 0
  const daysRemaining = Math.floor(timeRemaining / DAY).toString().padStart(2, '0')
  const hoursRemaining = Math.floor((timeRemaining % DAY) / HOUR).toString().padStart(2, '0')
  const minutesRemaining = Math.floor((timeRemaining % HOUR) / MINUTE).toString().padStart(2, '0')
  const secondsRemaining = Math.floor((timeRemaining % MINUTE) / SECOND).toString().padStart(2, '0')

  useEffect(() => {
    if (typeof window === 'undefined') return

    const intervalId = setInterval(() => setNow(new Date()), 1000)

    return () => clearInterval(intervalId)
  }, [])

  return (
    <div style={{ fontWeight: 600 }}>
      {daysRemaining} {hoursRemaining} {minutesRemaining} {secondsRemaining}
    </div>
  )
}
