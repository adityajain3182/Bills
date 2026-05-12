import { describe, expect, it } from 'vitest';
import { parentRouteFor } from './nav';

describe('parentRouteFor', () => {
  it('maps add/edit/settle back to the group page', () => {
    expect(parentRouteFor('/groups/abc/add')).toBe('/groups/abc');
    expect(parentRouteFor('/groups/abc/edit/expense-id')).toBe('/groups/abc');
    expect(parentRouteFor('/groups/abc/settle')).toBe('/groups/abc');
  });

  it('maps the group page back to groups list', () => {
    expect(parentRouteFor('/groups/abc')).toBe('/groups');
  });

  it('returns null for the root and unknown routes', () => {
    expect(parentRouteFor('/groups')).toBeNull();
    expect(parentRouteFor('/friends')).toBeNull();
    expect(parentRouteFor('/activity')).toBeNull();
    expect(parentRouteFor('/settings')).toBeNull();
    expect(parentRouteFor('/')).toBeNull();
    expect(parentRouteFor('/some/unknown/path')).toBeNull();
  });

  it('handles trailing slashes', () => {
    expect(parentRouteFor('/groups/abc/')).toBe('/groups');
    expect(parentRouteFor('/groups/abc/settle/')).toBe('/groups/abc');
  });

  it('does not get fooled by group IDs that contain "add" or "edit"', () => {
    expect(parentRouteFor('/groups/added-group')).toBe('/groups');
    expect(parentRouteFor('/groups/edited123')).toBe('/groups');
  });
});
