import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { hasActiveFilters, type MatrixFilters } from '../../model/filters';
import { OUTCOME_GROUP_ORDER, type OutcomeGroupId } from '../../model/matrix-model';
import { Button } from '../atoms/button';
import { Grow } from '../atoms/spacer';

export type Density = 'comfortable' | 'compact' | 'status-only';

export const OUTCOME_TITLES: Record<OutcomeGroupId, string> = {
  failed: 'Failed',
  'not-proven': 'Not proven',
  passed: 'Passed',
  missing: 'Missing'
};

const Bar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xs};
  position: relative;
`;

const Search = styled.input`
  width: 15rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: ${({ theme }) => theme.radius.md};
  padding: 0.375rem ${({ theme }) => theme.space.sm};
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: 0.125rem 0.25rem 0.125rem ${({ theme }) => theme.space.sm};
  font-size: ${({ theme }) => theme.font.xs};

  button {
    border: 0;
    background: none;
    color: var(--muted);
    padding: 0 0.375rem;
    border-radius: 99px;
  }
`;

const Menu = styled.div`
  position: absolute;
  top: 2.5rem;
  left: 15.75rem;
  z-index: 30;
  display: flex;
  gap: ${({ theme }) => theme.space.lg};
  padding: ${({ theme }) => theme.space.md};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: var(--shadow);

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 8rem;
  }
  legend {
    padding: 0;
    margin-bottom: 0.375rem;
    font-size: ${({ theme }) => theme.font.xs};
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  label {
    display: flex;
    gap: ${({ theme }) => theme.space.xs};
    align-items: center;
    padding: 0.125rem 0;
  }
`;

const Count = styled.span`
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.xs};
  margin-left: ${({ theme }) => theme.space.xs};
`;

const Segmented = styled.div`
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;

  button {
    border: 0;
    background: var(--surface);
    padding: 0.3125rem ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.sm};
  }
  button[aria-pressed='true'] {
    background: var(--accent-bg);
    color: var(--accent);
    font-weight: 600;
  }
`;

const DENSITIES: Array<{ id: Density; label: string }> = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
  { id: 'status-only', label: 'Status only' }
];

export interface FilterBarProps {
  filters: MatrixFilters;
  onFiltersChange: (filters: MatrixFilters) => void;
  dimensions: Array<{ name: string; values: string[] }>;
  density: Density;
  onDensityChange: (density: Density) => void;
  shown: number;
  total: number;
}

export function FilterBar({ filters, onFiltersChange, dimensions, density, onDensityChange, shown, total }: FilterBarProps): ReactNode {
  const [open, setOpen] = useState(false);
  const active = hasActiveFilters(filters);

  const toggleOutcome = (outcome: OutcomeGroupId): void =>
    onFiltersChange({ ...filters, outcomes: filters.outcomes.includes(outcome) ? filters.outcomes.filter((id) => id !== outcome) : [...filters.outcomes, outcome] });

  const toggleDimension = (name: string, value: string): void => {
    const current = filters.dimensions[name] ?? [];
    const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
    onFiltersChange({ ...filters, dimensions: { ...filters.dimensions, [name]: next } });
  };

  return (
    <Bar>
      <Search type="search" placeholder="Search items" aria-label="Search items" value={filters.search} onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })} />
      <Button type="button" aria-expanded={open} aria-controls="filter-menu" onClick={() => setOpen((value) => !value)}>
        Filter
      </Button>
      {open ? (
        <Menu id="filter-menu" role="group" aria-label="Filters">
          <fieldset>
            <legend>Outcome</legend>
            {OUTCOME_GROUP_ORDER.map((outcome) => (
              <label key={outcome}>
                <input type="checkbox" checked={filters.outcomes.includes(outcome)} onChange={() => toggleOutcome(outcome)} /> {OUTCOME_TITLES[outcome]}
              </label>
            ))}
          </fieldset>
          {dimensions.map((dimension) => (
            <fieldset key={dimension.name}>
              <legend>{dimension.name}</legend>
              {dimension.values.map((value) => (
                <label key={value}>
                  <input type="checkbox" checked={(filters.dimensions[dimension.name] ?? []).includes(value)} onChange={() => toggleDimension(dimension.name, value)} /> {value}
                </label>
              ))}
            </fieldset>
          ))}
        </Menu>
      ) : null}
      {filters.outcomes.map((outcome) => (
        <Chip key={outcome}>
          {OUTCOME_TITLES[outcome]}
          <button type="button" aria-label={`Remove filter ${OUTCOME_TITLES[outcome]}`} onClick={() => toggleOutcome(outcome)}>
            ×
          </button>
        </Chip>
      ))}
      {Object.entries(filters.dimensions).flatMap(([name, values]) =>
        values.map((value) => (
          <Chip key={`${name}:${value}`}>
            {name}: {value}
            <button type="button" aria-label={`Remove filter ${name} ${value}`} onClick={() => toggleDimension(name, value)}>
              ×
            </button>
          </Chip>
        ))
      )}
      <Count>{active ? `Showing ${shown} of ${total} items` : `${total} items`}</Count>
      <Grow />
      <Segmented role="group" aria-label="Density">
        {DENSITIES.map((entry) => (
          <button key={entry.id} type="button" aria-pressed={density === entry.id} onClick={() => onDensityChange(entry.id)}>
            {entry.label}
          </button>
        ))}
      </Segmented>
    </Bar>
  );
}
