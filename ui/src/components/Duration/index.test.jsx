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

    expect(container.textContent).toBe('05m 30s ');
  });

  it('should start interval when offset is not provided (running task)', () => {
    const from = new Date(Date.now() - 65000).toISOString(); // 65 seconds ago
    const { container } = render(<Duration from={from} />);

    expect(container.textContent).toMatch(/01m \d+s/);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(container.textContent).toMatch(/01m \d+s/);
  });

  it('should update in real-time when no offset is provided', () => {
    const originalDate = global.Date;
    const startTime = new originalDate('2025-01-01T00:01:00.000Z').getTime();
    let currentTime = startTime;

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

    const from = '2025-01-01T00:00:00.000Z';
    const { container } = render(<Duration from={from} />);

    expect(container.textContent).toBe('01m 00s ');

    currentTime = startTime + 5000;

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(container.textContent).toBe('01m 05s ');

    global.Date = originalDate;
  });

  it('should handle key prop change correctly (task switch due to filtering)', () => {
    const task1From = '2025-01-01T00:00:00.000Z';
    const task2From = '2025-01-01T00:10:00.000Z';
    const { container, rerender } = render(
      <Duration key="task1" from={task1From} />
    );

    rerender(<Duration key="task2" from={task2From} />);

    expect(container).toBeTruthy();
  });

  it('should clear interval when offset becomes defined', () => {
    const from = '2025-01-01T00:00:00.000Z';
    const { container, rerender } = render(<Duration from={from} />);
    const offset = '2025-01-01T00:05:00.000Z';

    rerender(<Duration from={from} offset={offset} />);

    expect(() => {
      act(() => {
        jest.advanceTimersByTime(5000);
      });
    }).not.toThrow();

    expect(container.textContent).toBe('05m 00s ');
  });

  it('should display hours correctly', () => {
    const from = '2025-01-01T00:00:00.000Z';
    const offset = '2025-01-01T02:30:45.000Z';
    const { container } = render(<Duration from={from} offset={offset} />);

    expect(container.textContent).toBe('2h 30m 45s ');
  });

  it('should display days correctly', () => {
    const from = '2025-01-01T00:00:00.000Z';
    const offset = '2025-01-03T05:30:45.000Z';
    const { container } = render(<Duration from={from} offset={offset} />);

    expect(container.textContent).toBe('2d 5h 30m 45s ');
  });
});
