import React from 'react';

/**
 * Skeleton Loader for Items Grid
 */
export const ItemSkeletonGrid = ({ count = 6 }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1.25rem',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'white',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1.5px solid #f1f5f9',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        >
          {/* Image skeleton */}
          <div
            style={{
              height: '190px',
              background: '#f1f5f9',
            }}
          />

          {/* Content skeleton */}
          <div style={{ padding: '1.1rem' }}>
            <div
              style={{
                height: '12px',
                background: '#e2e8f0',
                borderRadius: '8px',
                marginBottom: '0.75rem',
                width: '80%',
              }}
            />
            <div
              style={{
                height: '12px',
                background: '#e2e8f0',
                borderRadius: '8px',
                marginBottom: '1rem',
                width: '60%',
              }}
            />
            <div
              style={{
                height: '20px',
                background: '#e2e8f0',
                borderRadius: '8px',
                marginBottom: '0.75rem',
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: '32px',
                  background: '#e2e8f0',
                  borderRadius: '8px',
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: '32px',
                  background: '#e2e8f0',
                  borderRadius: '8px',
                }}
              />
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

/**
 * Skeleton Loader for Table Rows
 */
export const TableRowSkeleton = ({ count = 5, columns = 5 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, rowIdx) => (
        <tr key={rowIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
          {Array.from({ length: columns }).map((_, colIdx) => (
            <td
              key={colIdx}
              style={{
                padding: '0.85rem 1rem',
              }}
            >
              <div
                style={{
                  height: '12px',
                  background: '#e2e8f0',
                  borderRadius: '6px',
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  width: colIdx === 0 ? '80%' : '100%',
                }}
              />
            </td>
          ))}
        </tr>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
};

/**
 * Skeleton Loader for List
 */
export const ListSkeleton = ({ count = 8 }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            border: '1.5px solid #f1f5f9',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        >
          {/* Avatar skeleton */}
          <div
            style={{
              width: '40px',
              height: '40px',
              background: '#e2e8f0',
              borderRadius: '10px',
              flexShrink: 0,
            }}
          />

          {/* Content skeleton */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: '12px',
                background: '#e2e8f0',
                borderRadius: '6px',
                marginBottom: '0.5rem',
                width: '30%',
              }}
            />
            <div
              style={{
                height: '10px',
                background: '#e2e8f0',
                borderRadius: '6px',
                width: '50%',
              }}
            />
          </div>

          {/* Action skeleton */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                style={{
                  width: '32px',
                  height: '32px',
                  background: '#e2e8f0',
                  borderRadius: '8px',
                }}
              />
            ))}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

/**
 * Skeleton Loader for Cards
 */
export const CardSkeleton = ({ count = 4 }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,.06)',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            borderTop: '3px solid #e2e8f0',
          }}
        >
          <div
            style={{
              height: '12px',
              background: '#e2e8f0',
              borderRadius: '6px',
              marginBottom: '0.5rem',
              width: '70%',
            }}
          />
          <div
            style={{
              height: '24px',
              background: '#e2e8f0',
              borderRadius: '6px',
              marginTop: '0.75rem',
            }}
          />
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

/**
 * Full Page Skeleton Loader
 */
export const PageSkeleton = () => {
  return (
    <div style={{ padding: '2rem' }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: '2rem' }}>
        <div
          style={{
            height: '32px',
            background: '#e2e8f0',
            borderRadius: '8px',
            marginBottom: '0.5rem',
            width: '40%',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
        <div
          style={{
            height: '16px',
            background: '#e2e8f0',
            borderRadius: '6px',
            width: '25%',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
      </div>

      {/* Stats skeleton */}
      <CardSkeleton count={3} />

      {/* Controls skeleton */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          margin: '1.75rem 0',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: '200px',
            height: '40px',
            background: '#e2e8f0',
            borderRadius: '12px',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
        <div
          style={{
            width: '150px',
            height: '40px',
            background: '#e2e8f0',
            borderRadius: '12px',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
      </div>

      {/* Content skeleton */}
      <ItemSkeletonGrid count={6} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default {
  ItemSkeletonGrid,
  TableRowSkeleton,
  ListSkeleton,
  CardSkeleton,
  PageSkeleton,
};