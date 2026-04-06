import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MultiSelectOption = {
  label: string
  value: string
}

type MultiSelectDropdownProps = {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className,
  disabled = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggle = useCallback(
    (optionValue: string) => {
      if (value.includes(optionValue)) {
        onChange(value.filter((v) => v !== optionValue))
      } else {
        onChange([...value, optionValue])
      }
    },
    [value, onChange],
  )

  const allSelected = options.length > 0 && value.length === options.length
  const noneSelected = value.length === 0

  const toggleAll = useCallback(() => {
    if (allSelected) {
      onChange([])
    } else {
      onChange(options.map((o) => o.value))
    }
  }, [allSelected, options, onChange])

  // Build display text
  let displayText = placeholder
  if (value.length > 0) {
    if (allSelected) {
      displayText = 'All selected'
    } else if (value.length <= 2) {
      displayText = value
        .map((v) => options.find((o) => o.value === v)?.label ?? v)
        .join(', ')
    } else {
      displayText = `${value.length} selected`
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-[34px] min-w-[180px] items-center justify-between gap-2 rounded-md border border-neutral-700 bg-neutral-800 px-3 text-xs text-primary-foreground outline-none transition-colors hover:border-neutral-600 focus:border-blue-500 disabled:opacity-50',
          open && 'border-blue-500',
        )}
      >
        <span className="truncate">{displayText}</span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-secondary-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-60 min-w-full overflow-auto rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-xl">
          {/* Select All / Clear */}
          {options.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-secondary-foreground hover:bg-neutral-700 hover:text-primary-foreground"
            >
              <span
                className={cn(
                  'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                  allSelected
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-neutral-600',
                )}
              >
                {allSelected && <Check className="size-2.5" />}
              </span>
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          )}

          {options.length > 1 && (
            <div className="mx-2 my-1 border-t border-neutral-700" />
          )}

          {/* Options */}
          {options.map((option) => {
            const checked = value.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-primary-foreground hover:bg-neutral-700"
              >
                <span
                  className={cn(
                    'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                    checked
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-neutral-600',
                  )}
                >
                  {checked && <Check className="size-2.5" />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            )
          })}

          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-secondary-foreground">
              No options available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
