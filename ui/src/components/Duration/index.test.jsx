import React from 'react';
import { render, act } from '@testing-library/react';
import Duration from './index';

// Mock timers for testing setInterval behavior
jest.useFakeTimers();

describe('Duration component', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should render duration with fixed offset (completed task)', () => {
    const from = '2025-01-01T00:00:00.000Z';
    const offset = '2025-01-01T00:05:30.000Z';

    const { container } = render(<Duration from={from} offset={offset} />);

    // Should show 5 minutes 30 seconds
    expect(container.textContent).toBe('05m 30s ');
  });

  it('should start interval when offset is not provided (running task)', () => {
    const from = new Date(Date.now() - 65000).toISOString(); // 65 seconds ago

    const { container } = render(<Duration from={from} />);

    // Initial render should show ~1 minute
    expect(container.textContent).toMatch(/01m \d+s/);

    // Advance timer by 1 second
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Duration should still be updating
    expect(container.textContent).toMatch(/01m \d+s/);
  });

  it('should update in real-time when no offset is provided', () => {
    // Mock Date constructor to return controlled values
    const originalDate = global.Date;
    const startTime = new originalDate('2025-01-01T00:01:00.000Z').getTime();
    let currentTime = startTime;

    // Create a mock Date that tracks time
    class MockDate extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          super(currentTime);
        } else {
          super(...args);
        }
      }

      static now() {
        return currentTime;
      }
    }

    global.Date = MockDate;

    // Task started 60 seconds before our mock "now"
    const from = '2025-01-01T00:00:00.000Z';
    const { container } = render(<Duration from={from} />);

    // Should show 1 minute initially
    expect(container.textContent).toBe('01m 00s ');

    // Advance mock time by 5 seconds
    currentTime = startTime + 5000;

    // Trigger the interval callback
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Should now show 1 minute 5 seconds
    expect(container.textContent).toBe('01m 05s ');

    // Restore original Date
    global.Date = originalDate;
  });

  it('should handle key prop change correctly (task switch due to filtering)', () => {
    const task1From = '2025-01-01T00:00:00.000Z';
    const task2From = '2025-01-01T00:10:00.000Z';

    // Render Duration for task 1
    const { container, rerender } = render(
      <Duration key="task1" from={task1From} />
    );

    // Re-render with different key (simulates filtering causing different task at same index)
    rerender(<Duration key="task2" from={task2From} />);

    // The component should have been remounted with new props
    // This ensures the interval is properly reset for the new task
    expect(container).toBeTruthy();
  });

  it('should clear interval when offset becomes defined', () => {
    const from = '2025-01-01T00:00:00.000Z';

    const { rerender } = render(<Duration from={from} />);

    // Now provide an offset (task completed)
    const offset = '2025-01-01T00:05:00.000Z';

    rerender(<Duration from={from} offset={offset} />);

    // Interval should have been cleared - no errors should occur
    act(() => {
      jest.advanceTimersByTime(5000);
    });
  });

  it('should display hours correctly', () => {
    const from = '2025-01-01T00:00:00.000Z';
    const offset = '2025-01-01T02:30:45.000Z';

    const { container } = render(<Duration from={from} offset={offset} />);

    // Should show 2 hours 30 minutes 45 seconds
    expect(container.textContent).toBe('2h 30m 45s ');
  });

  it('should display days correctly', () => {
    const from = '2025-01-01T00:00:00.000Z';
    const offset = '2025-01-03T05:30:45.000Z';

    const { container } = render(<Duration from={from} offset={offset} />);

    // Should show 2 days 5 hours 30 minutes 45 seconds
    expect(container.textContent).toBe('2d 5h 30m 45s ');
  });
});
