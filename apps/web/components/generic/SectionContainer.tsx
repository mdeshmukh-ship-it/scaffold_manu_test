import { FC, PropsWithChildren as PWC, ReactNode } from 'react'

import { cn } from '@/lib/utils'

const SectionContainer: FC<
  PWC<{
    className?: string
    containerClassName?: string
    titleClassName?: string
    title: ReactNode
  }>
> = ({ className, containerClassName, titleClassName, title, children }) => (
  <div
    className={cn(
      'mb-2 flex flex-col border border-neutral-750 bg-neutral-800 p-6 xs:mb-4 xs:rounded-md',
      containerClassName
    )}
  >
    <div
      className={cn(
        'text-sm leading-5 font-medium text-primary-foreground',
        titleClassName
      )}
    >
      {title}
    </div>
    <div className={className}>{children}</div>
  </div>
)

export default SectionContainer
