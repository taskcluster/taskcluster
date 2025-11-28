import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskGroupTable from './index';

jest.mock('@material-ui/core/styles', () => ({
  withStyles: () => Component => {
    function StyledComponent(props) {
      return <Component {...props} classes={{}} />;
    }

    return StyledComponent;
  },
  alpha: (color, opacity) => `rgba(${color}, ${opacity})`,
}));

let capturedItemKey = null;
let capturedItemData = null;

jest.mock('react-window', () => ({
  FixedSizeList: jest.fn(
    ({ children: Children, itemData, itemKey, itemCount }) => {
      capturedItemKey = itemKey;
      capturedItemData = itemData;

      const items = [];

      for (let i = 0; i < Math.min(3, itemCount); i += 1) {
        const key = itemKey ? itemKey(i, itemData) : i;

        items.push(
          <div key={key} data-testid={`item-${i}`} data-item-key={key}>
            <Children data={itemData} index={i} style={{}} />
          </div>
        );
      }

      return <div data-testid="virtual-list">{items}</div>;
    }
  ),
}));

jest.mock('react-virtualized', () => ({
  WindowScroller: ({ children }) => children({}),
}));

const createMockTask = (taskId, name, state, started, resolved = null) => ({
  node: {
    taskId,
    metadata: { name },
    status: {
      state,
      runs: [{ runId: 0, started, resolved }],
    },
  },
});

describe('TaskGroupTable', () => {
  beforeEach(() => {
    capturedItemKey = null;
    capturedItemData = null;
  });

  const mockTasks = [
    createMockTask('task-1', 'A-Task', 'running', '2025-01-01T00:00:00Z', null),
    createMockTask(
      'task-2',
      'B-Task',
      'completed',
      '2025-01-01T00:00:00Z',
      '2025-01-01T00:05:00Z'
    ),
    createMockTask('task-3', 'C-Task', 'running', '2025-01-01T00:00:00Z', null),
  ];

  it('should use taskId as itemKey for proper component lifecycle on filter change', () => {
    render(
      <MemoryRouter>
        <TaskGroupTable
          taskGroupConnection={{ edges: mockTasks, pageInfo: {} }}
          filter=""
          searchTerm=""
        />
      </MemoryRouter>
    );

    expect(capturedItemKey).toBeDefined();
    expect(typeof capturedItemKey).toBe('function');

    expect(capturedItemKey(0, capturedItemData)).toBe('task-1');
    expect(capturedItemKey(1, capturedItemData)).toBe('task-2');
    expect(capturedItemKey(2, capturedItemData)).toBe('task-3');
  });

  it('should return different keys when filtering changes item order', () => {
    const { rerender } = render(
      <MemoryRouter>
        <TaskGroupTable
          taskGroupConnection={{ edges: mockTasks, pageInfo: {} }}
          filter=""
          searchTerm=""
        />
      </MemoryRouter>
    );
    const keyAtIndex0BeforeFilter = capturedItemKey(0, capturedItemData);

    expect(keyAtIndex0BeforeFilter).toBe('task-1');

    rerender(
      <MemoryRouter>
        <TaskGroupTable
          taskGroupConnection={{ edges: mockTasks, pageInfo: {} }}
          filter="running"
          searchTerm=""
        />
      </MemoryRouter>
    );

    const keyAtIndex0AfterFilter = capturedItemKey(0, capturedItemData);

    expect(keyAtIndex0AfterFilter).toBe(capturedItemData.items[0].node.taskId);
  });
});
