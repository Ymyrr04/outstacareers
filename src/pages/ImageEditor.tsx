import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const ImageEditor = () => {
  const [name, setName] = useState('Mark');
  const [role, setRole] = useState('Executive Virtual Assistant');
  const [isLoading, setIsLoading] = useState(false);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [originalImage] = useState('/images/contractor-bg-original.jpg');

  const handleEditImage = async () => {
    setIsLoading(true);
    try {
      // First, fetch the image and convert to base64
      const response = await fetch(originalImage);
      const blob = await response.blob();
      
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      
      const imageBase64 = await base64Promise;

      // Call the edge function
      const editResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-contractor-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            imageBase64,
            name,
            role,
          }),
        }
      );

      const data = await editResponse.json();

      if (!editResponse.ok) {
        throw new Error(data.error || 'Failed to edit image');
      }

      if (data.editedImageUrl) {
        setEditedImage(data.editedImageUrl);
        toast.success('Image edited successfully!');
      } else {
        toast.error('No edited image returned');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to edit image');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!editedImage) return;
    
    const link = document.createElement('a');
    link.href = editedImage;
    link.download = `${name.replace(/\s+/g, '-').toLowerCase()}-contractor.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8 text-center">Contractor Image Editor</h1>
      
      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Original Image</CardTitle>
          </CardHeader>
          <CardContent>
            <img 
              src={originalImage} 
              alt="Original contractor background" 
              className="w-full rounded-lg shadow-md"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Edit Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Enter role"
              />
            </div>

            <Button 
              onClick={handleEditImage} 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Edited Image'
              )}
            </Button>

            {editedImage && (
              <div className="space-y-4 mt-6">
                <h3 className="font-semibold">Edited Result:</h3>
                <img 
                  src={editedImage} 
                  alt="Edited contractor background" 
                  className="w-full rounded-lg shadow-md"
                />
                <Button onClick={handleDownload} variant="outline" className="w-full">
                  Download Image
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ImageEditor;
