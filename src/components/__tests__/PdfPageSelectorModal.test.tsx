import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PdfPageSelectorModal } from '../PdfPageSelectorModal';

describe('PdfPageSelectorModal', () => {
  const samplePages = [
    { pageNumber: 1, thumbnailUrl: 'data:image/jpeg;base64,page1' },
    { pageNumber: 2, thumbnailUrl: 'data:image/jpeg;base64,page2' },
    { pageNumber: 3, thumbnailUrl: 'data:image/jpeg;base64,page3' },
  ];

  it('renders correctly with page thumbnails and file information', () => {
    const onSelectPage = vi.fn();
    const onClose = vi.fn();

    render(
      <PdfPageSelectorModal
        isOpen={true}
        totalPages={3}
        pages={samplePages}
        fileName="STRUCTURAL-PLANS.pdf"
        onSelectPage={onSelectPage}
        onClose={onClose}
      />
    );

    expect(screen.getByText('เลือกหน้าแปลนคานที่ต้องการนำเข้า')).toBeDefined();
    expect(screen.getByText('STRUCTURAL-PLANS.pdf')).toBeDefined();
    expect(screen.getAllByText('หน้า 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('หน้า 2')).toBeDefined();
    expect(screen.getByText('หน้า 3')).toBeDefined();
  });

  it('allows clicking another page and clicking confirm button', () => {
    const onSelectPage = vi.fn();
    const onClose = vi.fn();

    render(
      <PdfPageSelectorModal
        isOpen={true}
        totalPages={3}
        pages={samplePages}
        fileName="STRUCTURAL-PLANS.pdf"
        onSelectPage={onSelectPage}
        onClose={onClose}
      />
    );

    // Click Page 2 card
    const page2Label = screen.getByText('หน้า 2');
    fireEvent.click(page2Label);

    // Confirm button should say "นำเข้าหน้าที่ 2"
    const confirmButton = screen.getByText('นำเข้าหน้าที่ 2');
    fireEvent.click(confirmButton);

    expect(onSelectPage).toHaveBeenCalledWith(2);
  });

  it('triggers onClose when cancel button is clicked', () => {
    const onSelectPage = vi.fn();
    const onClose = vi.fn();

    render(
      <PdfPageSelectorModal
        isOpen={true}
        totalPages={3}
        pages={samplePages}
        fileName="STRUCTURAL-PLANS.pdf"
        onSelectPage={onSelectPage}
        onClose={onClose}
      />
    );

    const cancelButton = screen.getByText('ยกเลิก');
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });
});
