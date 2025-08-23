import React from 'react'
import {
  ResponsiveText,
  ResponsiveButton,
  ResponsiveInput,
  ResponsiveTable,
  ResponsiveCard,
  ResponsiveIcon,
  ResponsiveContainer,
  ResponsiveGrid,
  ResponsiveSpacing,
} from '@/components/ui/responsive'
import { useResponsive, useResponsiveScale, useResponsiveLayout } from '@/hooks/useResponsive'
import { Package, DollarSign, TrendingUp, Users } from 'lucide-react'

// Example component showing responsive scaling in action
export const ResponsiveExample: React.FC = () => {
  const { width, screenSize, isSmallScreen } = useResponsive()
  const { buttonSize, textSize, scaleFactor } = useResponsiveScale()
  const { showSidebar } = useResponsiveLayout()

  return (
    <ResponsiveContainer>
      {/* Header with responsive text */}
      <div className="mb-6">
        <ResponsiveText
          size="3xl"
          className="mb-2 font-bold"
        >
          Responsive Scaling Demo
        </ResponsiveText>
        <ResponsiveText
          size="base"
          className="text-muted-foreground"
        >
          Current screen: {width}px ({screenSize}) - Scale factor: {scaleFactor}
        </ResponsiveText>
      </div>

      {/* Responsive Grid Layout */}
      <ResponsiveGrid
        variant="lg"
        className="mb-6"
      >
        {/* KPI Cards */}
        <ResponsiveCard>
          <ResponsiveSpacing>
            <ResponsiveIcon variant="lg">
              <Package className="text-primary" />
            </ResponsiveIcon>
            <div>
              <ResponsiveText
                size="sm"
                className="text-muted-foreground"
              >
                Total Shipments
              </ResponsiveText>
              <ResponsiveText
                size="2xl"
                className="font-bold"
              >
                1,234
              </ResponsiveText>
            </div>
          </ResponsiveSpacing>
        </ResponsiveCard>

        <ResponsiveCard>
          <ResponsiveSpacing>
            <ResponsiveIcon variant="lg">
              <DollarSign className="text-success" />
            </ResponsiveIcon>
            <div>
              <ResponsiveText
                size="sm"
                className="text-muted-foreground"
              >
                Revenue
              </ResponsiveText>
              <ResponsiveText
                size="2xl"
                className="font-bold"
              >
                ₹50,00,000
              </ResponsiveText>
            </div>
          </ResponsiveSpacing>
        </ResponsiveCard>

        <ResponsiveCard>
          <ResponsiveSpacing>
            <ResponsiveIcon variant="lg">
              <TrendingUp className="text-warning" />
            </ResponsiveIcon>
            <div>
              <ResponsiveText
                size="sm"
                className="text-muted-foreground"
              >
                Growth
              </ResponsiveText>
              <ResponsiveText
                size="2xl"
                className="font-bold"
              >
                +15.2%
              </ResponsiveText>
            </div>
          </ResponsiveSpacing>
        </ResponsiveCard>

        <ResponsiveCard>
          <ResponsiveSpacing>
            <ResponsiveIcon variant="lg">
              <Users className="text-primary" />
            </ResponsiveIcon>
            <div>
              <ResponsiveText
                size="sm"
                className="text-muted-foreground"
              >
                Active Suppliers
              </ResponsiveText>
              <ResponsiveText
                size="2xl"
                className="font-bold"
              >
                89
              </ResponsiveText>
            </div>
          </ResponsiveSpacing>
        </ResponsiveCard>
      </ResponsiveGrid>

      {/* Responsive Form */}
      <ResponsiveCard className="mb-6">
        <ResponsiveText
          size="xl"
          className="mb-4 font-semibold"
        >
          Responsive Form
        </ResponsiveText>
        <ResponsiveSpacing variant="lg">
          <div>
            <ResponsiveText
              size="sm"
              className="mb-2 block"
            >
              Name
            </ResponsiveText>
            <ResponsiveInput placeholder="Enter your name" />
          </div>
          <div>
            <ResponsiveText
              size="sm"
              className="mb-2 block"
            >
              Email
            </ResponsiveText>
            <ResponsiveInput
              type="email"
              placeholder="Enter your email"
            />
          </div>
          <div>
            <ResponsiveText
              size="sm"
              className="mb-2 block"
            >
              Message
            </ResponsiveText>
            <ResponsiveInput placeholder="Enter your message" />
          </div>
          <ResponsiveButton onClick={() => alert('Form submitted!')}>Submit Form</ResponsiveButton>
        </ResponsiveSpacing>
      </ResponsiveCard>

      {/* Responsive Table */}
      <ResponsiveCard>
        <ResponsiveText
          size="xl"
          className="mb-4 font-semibold"
        >
          Responsive Data Table
        </ResponsiveText>
        <ResponsiveTable>
          <thead>
            <tr>
              <th>
                <ResponsiveText
                  size="sm"
                  className="font-semibold"
                >
                  Supplier Name
                </ResponsiveText>
              </th>
              <th>
                <ResponsiveText
                  size="sm"
                  className="font-semibold"
                >
                  Contact
                </ResponsiveText>
              </th>
              <th>
                <ResponsiveText
                  size="sm"
                  className="font-semibold"
                >
                  Status
                </ResponsiveText>
              </th>
              <th>
                <ResponsiveText
                  size="sm"
                  className="font-semibold"
                >
                  Actions
                </ResponsiveText>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <ResponsiveText>ABC Manufacturing Co.</ResponsiveText>
              </td>
              <td>
                <ResponsiveText>john@abc.com</ResponsiveText>
              </td>
              <td>
                <span className="text-fluid-xs bg-success/10 text-success rounded px-2 py-1">Active</span>
              </td>
              <td>
                <ResponsiveSpacing variant="sm">
                  <ResponsiveButton
                    variant="sm"
                    size="sm"
                  >
                    Edit
                  </ResponsiveButton>
                  <ResponsiveButton
                    variant="sm"
                    size="sm"
                  >
                    View
                  </ResponsiveButton>
                </ResponsiveSpacing>
              </td>
            </tr>
            <tr>
              <td>
                <ResponsiveText>XYZ Industries Ltd.</ResponsiveText>
              </td>
              <td>
                <ResponsiveText>sarah@xyz.com</ResponsiveText>
              </td>
              <td>
                <span className="text-fluid-xs bg-warning/10 text-warning rounded px-2 py-1">Pending</span>
              </td>
              <td>
                <ResponsiveSpacing variant="sm">
                  <ResponsiveButton
                    variant="sm"
                    size="sm"
                  >
                    Edit
                  </ResponsiveButton>
                  <ResponsiveButton
                    variant="sm"
                    size="sm"
                  >
                    View
                  </ResponsiveButton>
                </ResponsiveSpacing>
              </td>
            </tr>
          </tbody>
        </ResponsiveTable>
      </ResponsiveCard>

      {/* Debug Information */}
      <ResponsiveCard className="mt-6">
        <ResponsiveText
          size="lg"
          className="mb-4 font-semibold"
        >
          Debug Information
        </ResponsiveText>
        <ResponsiveSpacing variant="sm">
          <div>
            <ResponsiveText
              size="sm"
              className="font-medium"
            >
              Screen Width:
            </ResponsiveText>
            <ResponsiveText size="sm">{width}px</ResponsiveText>
          </div>
          <div>
            <ResponsiveText
              size="sm"
              className="font-medium"
            >
              Screen Size:
            </ResponsiveText>
            <ResponsiveText size="sm">{screenSize}</ResponsiveText>
          </div>
          <div>
            <ResponsiveText
              size="sm"
              className="font-medium"
            >
              Is Small Screen:
            </ResponsiveText>
            <ResponsiveText size="sm">{isSmallScreen ? 'Yes' : 'No'}</ResponsiveText>
          </div>
          <div>
            <ResponsiveText
              size="sm"
              className="font-medium"
            >
              Button Size:
            </ResponsiveText>
            <ResponsiveText size="sm">{buttonSize}</ResponsiveText>
          </div>
          <div>
            <ResponsiveText
              size="sm"
              className="font-medium"
            >
              Text Size:
            </ResponsiveText>
            <ResponsiveText size="sm">{textSize}</ResponsiveText>
          </div>
          <div>
            <ResponsiveText
              size="sm"
              className="font-medium"
            >
              Scale Factor:
            </ResponsiveText>
            <ResponsiveText size="sm">{scaleFactor}</ResponsiveText>
          </div>
          <div>
            <ResponsiveText
              size="sm"
              className="font-medium"
            >
              Show Sidebar:
            </ResponsiveText>
            <ResponsiveText size="sm">{showSidebar ? 'Yes' : 'No'}</ResponsiveText>
          </div>
        </ResponsiveSpacing>
      </ResponsiveCard>
    </ResponsiveContainer>
  )
}

// Example of using responsive classes directly
export const ResponsiveClassesExample: React.FC = () => {
  return (
    <div className="p-fluid">
      <h1 className="text-fluid-2xl mb-4 font-bold">Direct CSS Classes Example</h1>

      <div className="space-fluid">
        <button className="btn-fluid bg-primary text-primary-foreground">Default Button</button>
        <button className="btn-fluid-sm bg-success text-success-foreground">Small Button</button>
        <button className="btn-fluid-lg bg-destructive text-destructive-foreground">Large Button</button>
      </div>

      <div className="space-fluid mt-6">
        <input
          className="input-fluid rounded border"
          placeholder="Default input"
        />
        <input
          className="input-fluid-sm rounded border"
          placeholder="Small input"
        />
        <input
          className="input-fluid-lg rounded border"
          placeholder="Large input"
        />
      </div>

      <div className="card-fluid mt-6">
        <h3 className="text-fluid-lg font-semibold">Card with Direct Classes</h3>
        <p className="text-fluid-base">This card uses direct CSS classes for responsive scaling.</p>
      </div>
    </div>
  )
}

// Example of using responsive hooks for conditional rendering
export const ResponsiveConditionalExample: React.FC = () => {
  const { isSmallScreen, isLargeScreen } = useResponsive()
  const { sidebarWidth } = useResponsiveLayout()

  return (
    <div className="p-fluid">
      <h2 className="text-fluid-xl mb-4 font-bold">Conditional Rendering Example</h2>

      {isSmallScreen && (
        <div className="card-fluid-sm bg-warning/10">
          <p className="text-fluid-sm">This content only shows on small screens (≤1366px)</p>
        </div>
      )}

      {isLargeScreen && (
        <div className="card-fluid-lg bg-success/10">
          <p className="text-fluid-lg">This content only shows on large screens (&gt;1920px)</p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-fluid-base">
          Sidebar width class: <code>{sidebarWidth}</code>
        </p>
      </div>
    </div>
  )
}
