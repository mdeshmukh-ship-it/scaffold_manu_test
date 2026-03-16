import { FC } from 'react'
import { LoaderCircle, type LucideProps } from 'lucide-react'

import { cn } from '@/lib/utils'

const Spinner: FC<LucideProps> = ({ className, ...props }) => (
  <LoaderCircle className={cn('size-4 animate-spin', className)} {...props} />
)

export { Spinner }
